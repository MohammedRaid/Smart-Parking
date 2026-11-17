"""End-to-end API smoke test. Run with the server listening on 127.0.0.1:8000."""

import sys
from datetime import date, datetime, timedelta

import httpx

BASE = "http://127.0.0.1:8000"
client = httpx.Client(base_url=BASE, timeout=20)
failures: list[str] = []


def check(label: str, condition: bool, detail: object = "") -> None:
    print(("PASS " if condition else "FAIL ") + label + (f"  [{detail}]" if not condition else ""))
    if not condition:
        failures.append(label)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


health = client.get("/api/health")
check("health ok", health.status_code == 200 and health.json()["status"] == "ok", health.text)
check("payment mode reported", health.json()["payments"]["mode"] in ("mock", "live"), health.text)

stats = client.get("/api/stats").json()
check("seed stats present", stats["locations"] >= 6 and stats["parking_spaces"] > 0, stats)

# --- customer login + search ------------------------------------------------
login = client.post("/api/auth/login/customer", json={"email": "priya@example.com", "password": "password123"})
check("customer login", login.status_code == 200, login.text)
customer_token = login.json()["access_token"]
customer_id = login.json()["user"]["id"]

bad_login = client.post("/api/auth/login", json={"email": "priya@example.com", "password": "wrong"})
check("bad password rejected", bad_login.status_code == 401, bad_login.text)

wrong_role = client.post("/api/auth/login/admin", json={"email": "priya@example.com", "password": "password123"})
check("role-scoped login enforced", wrong_role.status_code == 403, wrong_role.text)

tomorrow = (date.today() + timedelta(days=1)).isoformat()
search = client.get("/api/parking", params={"city": "Bengaluru", "booking_date": tomorrow, "start_time": "10:00", "end_time": "13:00"})
check("parking search", search.status_code == 200 and search.json()["count"] >= 1, search.text[:300])
results = search.json()["results"]
check("availability computed", all(r["availability"]["status"] in ("green", "orange", "red") for r in results), results[:1])
koramangala = next(r for r in results if "Koramangala" in r["name"])
# 9 of 16 slots reserved tomorrow 10-13 -> 7 free, orange
check("overlapping reservation counted", koramangala["availability"]["reserved_slots"] == 9, koramangala["availability"])
check("future window still has free slots", koramangala["availability"]["available_slots"] == 7, koramangala["availability"])

other_window = client.get(
    f"/api/parking/{koramangala['id']}",
    params={"booking_date": tomorrow, "start_time": "20:00", "end_time": "22:00"},
).json()
check("non-overlapping window stays green", other_window["availability"]["status"] == "green", other_window["availability"])

detail = client.get(f"/api/parking/{koramangala['id']}").json()
check("parking detail has slots + owner", len(detail["slots"]) == 16 and detail["owner"]["full_name"], detail.get("slots"))

unauth_booking = client.post("/api/bookings", json={"location_id": koramangala["id"], "booking_date": tomorrow, "start_time": "10:00", "end_time": "12:00"})
check("booking requires auth", unauth_booking.status_code == 401, unauth_booking.text)

# --- booking + payment ------------------------------------------------------
payload = {"location_id": koramangala["id"], "booking_date": tomorrow, "start_time": "10:00", "end_time": "12:00", "vehicle_number": "KA05MJ4321"}
created = client.post("/api/bookings", json=payload, headers=auth(customer_token))
check("booking created", created.status_code == 201, created.text[:400])
body = created.json()
code = body["booking"]["code"]
check("booking awaits payment", body["booking"]["status"] == "pending_payment", body["booking"]["status"])
check("payment order returned", bool(body["checkout"]["order_id"]), body["checkout"])
check("qr token generated", len(body["booking"]["qr_token"]) > 20, body["booking"]["qr_token"][:10])
check("price calculated", body["booking"]["amount"] > 0, body["booking"]["amount"])

verify_unpaid = client.post("/api/bookings/verify", json={"qr_token": body["booking"]["qr_token"], "action": "auto"}, headers=auth(client.post("/api/auth/login/landowner", json={"email": "suresh@example.com", "password": "password123"}).json()["access_token"]))
check("unpaid booking cannot be scanned in", verify_unpaid.status_code == 400, verify_unpaid.text)

paid = client.post(f"/api/payments/{code}/mock-pay", json={"method": "upi"}, headers=auth(customer_token))
check("mock payment succeeds", paid.status_code == 200, paid.text[:300])
check("booking becomes reserved", paid.json()["booking"]["status"] == "reserved", paid.json()["booking"]["status"])
check("receipt issued", bool(paid.json()["booking"]["payment"]["receipt_no"]), paid.json()["booking"]["payment"])

double = client.post(f"/api/payments/{code}/mock-pay", json={"method": "upi"}, headers=auth(customer_token))
check("duplicate payment prevented", double.status_code == 200 and double.json()["detail"] == "Already paid", double.text[:200])

after_book = client.get(f"/api/parking/{koramangala['id']}", params={"booking_date": tomorrow, "start_time": "10:00", "end_time": "12:00"}).json()
check("availability drops after booking", after_book["availability"]["available_slots"] == 6, after_book["availability"])

# --- overlap prevention -----------------------------------------------------
landowner_token = client.post("/api/auth/login/landowner", json={"email": "suresh@example.com", "password": "password123"}).json()["access_token"]
bookings_before = client.get("/api/landowner/bookings", headers=auth(landowner_token)).json()
slot_taken = {b["slot"]["id"] for b in bookings_before if b["booking_date"] == tomorrow and b["status"] == "reserved" and b["start_time"] == "10:00" and b["end_time"] == "12:00"}
check("new booking uses a distinct slot", len(slot_taken) == 1, slot_taken)

# --- QR check-in / check-out (needs a booking for right now) ----------------
now = datetime.now()
start_min = ((now.hour * 60 + now.minute) // 30 + 1) * 30
end_min = min(start_min + 120, 23 * 60)
if end_min - start_min < 30:
    print("SKIP qr flow – too late in the day for a same-day window")
    sys.exit(1)

today_booking = client.post(
    "/api/bookings",
    json={
        "location_id": koramangala["id"],
        "booking_date": date.today().isoformat(),
        "start_time": f"{start_min // 60:02d}:{start_min % 60:02d}",
        "end_time": f"{end_min // 60:02d}:{end_min % 60:02d}",
        "vehicle_number": "KA05MJ4321",
    },
    headers=auth(customer_token),
)
check("same-day booking created", today_booking.status_code == 201, today_booking.text[:300])
today_code = today_booking.json()["booking"]["code"]
paid_today = client.post(f"/api/payments/{today_code}/mock-pay", json={"method": "upi"}, headers=auth(customer_token))
check("same-day payment", paid_today.status_code == 200, paid_today.text[:200])

token = client.get(f"/api/bookings/{today_code}", headers=auth(customer_token)).json()["qr_token"]
checkin = client.post("/api/bookings/verify", json={"qr_token": token, "action": "auto"}, headers=auth(landowner_token))
check("qr check-in accepted", checkin.status_code == 200 and checkin.json()["action"] == "check_in", checkin.text[:300])
check("booking parked", checkin.json()["booking"]["status"] == "parked", checkin.json()["booking"]["status"])

other_owner = client.post("/api/auth/login/landowner", json={"email": "meera@example.com", "password": "password123"}).json()["access_token"]
foreign = client.post("/api/bookings/verify", json={"qr_token": token, "action": "auto"}, headers=auth(other_owner))
check("foreign landowner cannot verify", foreign.status_code == 400, foreign.text[:200])

tampered = client.post("/api/bookings/verify", json={"qr_token": token[:-2] + "xx", "action": "auto"}, headers=auth(landowner_token))
check("tampered qr rejected", tampered.status_code == 400, tampered.text[:200])

checkout = client.post("/api/bookings/verify", json={"qr_token": token, "action": "auto"}, headers=auth(landowner_token))
check("qr check-out completes", checkout.status_code == 200 and checkout.json()["action"] == "check_out", checkout.text[:200])
check("booking completed", checkout.json()["booking"]["status"] == "completed", checkout.json()["booking"]["status"])

again = client.post("/api/bookings/verify", json={"qr_token": token, "action": "auto"}, headers=auth(landowner_token))
check("reused qr rejected", again.status_code == 400, again.text[:200])

# --- cancellation + refund --------------------------------------------------
second = client.post("/api/bookings", json={"location_id": koramangala["id"], "booking_date": tomorrow, "start_time": "18:00", "end_time": "20:00"}, headers=auth(customer_token)).json()
second_code = second["booking"]["code"]
client.post(f"/api/payments/{second_code}/mock-pay", json={"method": "card"}, headers=auth(customer_token))
cancelled = client.post(f"/api/bookings/{second_code}/cancel", json={"reason": "Change of plan"}, headers=auth(customer_token))
check("cancellation refunds", cancelled.status_code == 200 and cancelled.json()["refund_amount"] > 0, cancelled.text[:300])
check("booking cancelled", cancelled.json()["booking"]["status"] == "cancelled", cancelled.json()["booking"]["status"])

# --- landowner flows --------------------------------------------------------
mine = client.get("/api/landowner/bookings", headers=auth(landowner_token))
check("landowner bookings list", mine.status_code == 200 and len(mine.json()) >= 4, mine.text[:200])
earnings = client.get("/api/landowner/earnings", headers=auth(landowner_token)).json()
check("earnings computed", earnings["gross_earnings"] > 0 and earnings["net_earnings"] < earnings["gross_earnings"], earnings["gross_earnings"])
check("monthly series present", len(earnings["monthly"]) == 6, earnings["monthly"])

new_location = client.post(
    "/api/landowner/locations",
    json={
        "name": "Smoke Test Yard",
        "description": "Created by automated smoke test",
        "address": "42 Test Road, Bengaluru",
        "city": "Bengaluru",
        "area": "Test Nagar",
        "latitude": 12.9,
        "longitude": 77.6,
        "total_slots": 3,
        "price_hourly": 20,
        "price_daily": 150,
        "price_monthly": 3000,
        "open_time": "07:00",
        "close_time": "22:00",
        "images": [],
    },
    headers=auth(landowner_token),
)
check("landowner can add listing", new_location.status_code == 201, new_location.text[:300])
new_id = new_location.json()["id"]
check("new listing is pending", new_location.json()["status"] == "pending", new_location.json()["status"])

hidden = client.get(f"/api/parking/{new_id}")
check("pending listing hidden from customers", hidden.status_code == 404, hidden.status_code)

slots = client.get(f"/api/landowner/locations/{new_id}/slots", headers=auth(landowner_token)).json()
check("slots auto-created", len(slots["slots"]) == 3, slots["slots"])

# --- admin ------------------------------------------------------------------
admin_token = client.post("/api/auth/login/admin", json={"email": "admin@smartpark.in", "password": "Admin@123"}).json()["access_token"]
check("admin role blocked from customer pages", client.get("/api/bookings", headers=auth(admin_token)).status_code == 403)

stats_admin = client.get("/api/admin/stats", headers=auth(admin_token)).json()
check("admin stats", stats_admin["users"]["customers"] >= 3 and stats_admin["listings"]["approved"] >= 6, stats_admin["users"])
check("platform revenue tracked", stats_admin["revenue"]["platform"] > 0, stats_admin["revenue"])

pending = client.get("/api/admin/parking", params={"status": "pending"}, headers=auth(admin_token)).json()
check("pending listings visible to admin", len(pending) >= 2, len(pending))

approved = client.post(f"/api/admin/parking/{new_id}/approve", headers=auth(admin_token))
check("admin approves listing", approved.status_code == 200, approved.text)
visible = client.get(f"/api/parking/{new_id}")
check("approved listing goes live", visible.status_code == 200, visible.status_code)

blocked = client.post(f"/api/admin/users/{customer_id}/block", headers=auth(admin_token))
check("admin blocks user", blocked.status_code == 200, blocked.text)
blocked_login = client.post("/api/auth/login", json={"email": "priya@example.com", "password": "password123"})
check("blocked user cannot log in", blocked_login.status_code == 403, blocked_login.text)
client.post(f"/api/admin/users/{customer_id}/unblock", headers=auth(admin_token))

complaints = client.get("/api/admin/complaints", headers=auth(admin_token))
check("complaints list", complaints.status_code == 200 and len(complaints.json()) >= 1, complaints.text[:200])

payments_list = client.get("/api/payments/history", headers=auth(customer_token)).json()
check("payment history", len(payments_list) >= 1 and payments_list[0]["receipt_no"], payments_list[:1])

notifications = client.get("/api/notifications", headers=auth(customer_token))
check("notifications", notifications.status_code == 200 and len(notifications.json()["items"]) >= 1, notifications.text[:200])

print("\n" + ("ALL CHECKS PASSED" if not failures else f"{len(failures)} FAILURES: {failures}"))
sys.exit(1 if failures else 0)
