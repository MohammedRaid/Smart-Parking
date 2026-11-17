export type Role = "customer" | "landowner" | "admin";

export interface User {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  role: Role;
  is_blocked: boolean;
  is_verified: boolean;
}

export interface Availability {
  date: string;
  start_time: string;
  end_time: string;
  total_slots: number;
  available_slots: number;
  occupied_slots: number;
  reserved_slots: number;
  status: "green" | "orange" | "red";
  free_slot_ids: number[];
  free_slot_labels: string[];
}

export interface Owner {
  id: number;
  full_name: string;
  phone: string | null;
  email: string;
  member_since: string | null;
}

export interface SlotInfo {
  id: number;
  label: string;
  vehicle_type: string;
  is_active: boolean;
  is_blocked: boolean;
  is_free: boolean;
}

export interface Review {
  id: number;
  rating: number;
  comment: string;
  user: string;
  created_at: string;
}

export interface ParkingLocation {
  id: number;
  name: string;
  description: string;
  address: string;
  city: string;
  area: string;
  latitude: number;
  longitude: number;
  total_slots: number;
  price_hourly: number;
  price_daily: number;
  price_monthly: number;
  open_time: string;
  close_time: string;
  images: string[];
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  created_at: string | null;
  rating: { average: number; count: number };
  availability: Availability | null;
  distance_km: number | null;
  owner?: Owner;
  slots?: SlotInfo[];
  reviews?: Review[];
  stats?: { total_bookings: number; revenue: number; parked_now: number };
}

export interface PaymentInfo {
  status: string;
  mode: string;
  method: string | null;
  amount: number;
  currency: string;
  provider_order_id: string;
  provider_payment_id: string | null;
  receipt_no: string;
  paid_at: string | null;
  key_id: string | null;
}

export type BookingStatus =
  | "pending_payment"
  | "reserved"
  | "parked"
  | "completed"
  | "cancelled"
  | "expired";

export interface Booking {
  id: number;
  code: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  amount: number;
  status: BookingStatus;
  qr_token: string;
  vehicle_number: string | null;
  created_at: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  cancelled_at: string | null;
  refund_amount: number;
  refund_status: string | null;
  slot: { id: number; label: string } | null;
  location: {
    id: number;
    name: string;
    address: string;
    city: string;
    area: string;
    latitude: number;
    longitude: number;
    open_time: string;
    close_time: string;
    images: string[];
  } | null;
  payment: PaymentInfo | null;
  customer?: { id: number; full_name: string; email: string; phone: string | null };
  cancellation?: { refund_amount: number; policy: string; can_cancel: boolean };
  verifications?: { action: string; result: string; note: string; scanned_at: string }[];
}

export interface Checkout {
  mode: "mock" | "live";
  order_id: string;
  key_id: string | null;
  amount: number;
  currency: string;
  receipt: string;
  mock_payment_allowed: boolean;
}

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  kind: string;
  is_read: boolean;
  created_at: string;
}

export interface Earnings {
  gross_earnings: number;
  net_earnings: number;
  platform_fee: number;
  refunds: number;
  paid_bookings: number;
  active_bookings: number;
  completed_bookings: number;
  monthly: { month: string; earnings: number; bookings: number }[];
  locations: {
    id: number;
    name: string;
    city: string;
    status: string;
    bookings: number;
    gross: number;
    net: number;
    hourly: number;
  }[];
  transactions: {
    id: number;
    kind: string;
    amount: number;
    status: string;
    reference: string;
    note: string;
    created_at: string;
  }[];
}

export interface AdminStats {
  users: { customers: number; landowners: number; blocked: number; total: number };
  listings: { pending: number; approved: number; rejected: number };
  bookings: {
    total: number;
    today: number;
    parked: number;
    reserved: number;
    completed: number;
    cancelled: number;
  };
  revenue: { gross: number; platform: number; refunds: number };
  complaints_open: number;
  monthly: { month: string; revenue: number; bookings: number }[];
  top_locations: { name: string; city: string; bookings: number }[];
  recent_bookings: Booking[];
}
