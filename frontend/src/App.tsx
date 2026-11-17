import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { RealtimeProvider } from "./context/RealtimeContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import CustomerDashboard from "./pages/CustomerDashboard";
import ParkingMap from "./pages/ParkingMap";
import ParkingDetails from "./pages/ParkingDetails";
import Reservation from "./pages/Reservation";
import Payment from "./pages/Payment";
import BookingConfirmation from "./pages/BookingConfirmation";
import BookingQr from "./pages/BookingQr";
import BookingDetail from "./pages/BookingDetail";
import BookingHistory from "./pages/BookingHistory";
import LandownerDashboard from "./pages/LandownerDashboard";
import AddParking from "./pages/AddParking";
import ManageSlots from "./pages/ManageSlots";
import ScannerPage from "./pages/ScannerPage";
import Earnings from "./pages/Earnings";
import AdminDashboard from "./pages/AdminDashboard";
import Profile from "./pages/Profile";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RealtimeProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />

              {/* Auth */}
              <Route path="register" element={<Register />} />
              <Route path="login" element={<Login />} />
              <Route path="landowner/register" element={<Register role="landowner" />} />
              <Route path="landowner/login" element={<Login role="landowner" />} />
              <Route path="admin/login" element={<Login role="admin" />} />

              {/* Customer */}
              <Route path="map" element={<ParkingMap />} />
              <Route path="parking/:id" element={<ParkingDetails />} />
              <Route
                path="dashboard"
                element={
                  <ProtectedRoute roles={["customer"]}>
                    <CustomerDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="parking/:id/reserve"
                element={
                  <ProtectedRoute roles={["customer", "landowner", "admin"]}>
                    <Reservation />
                  </ProtectedRoute>
                }
              />
              <Route
                path="payment/:code"
                element={
                  <ProtectedRoute roles={["customer"]}>
                    <Payment />
                  </ProtectedRoute>
                }
              />
              <Route
                path="booking/:code"
                element={
                  <ProtectedRoute roles={["customer", "landowner", "admin"]}>
                    <BookingDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="booking/:code/confirmed"
                element={
                  <ProtectedRoute roles={["customer"]}>
                    <BookingConfirmation />
                  </ProtectedRoute>
                }
              />
              <Route
                path="booking/:code/qr"
                element={
                  <ProtectedRoute roles={["customer", "landowner", "admin"]}>
                    <BookingQr />
                  </ProtectedRoute>
                }
              />
              <Route
                path="bookings"
                element={
                  <ProtectedRoute roles={["customer"]}>
                    <BookingHistory />
                  </ProtectedRoute>
                }
              />

              {/* Landowner */}
              <Route
                path="landowner"
                element={
                  <ProtectedRoute roles={["landowner"]}>
                    <LandownerDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="landowner/listings/new"
                element={
                  <ProtectedRoute roles={["landowner"]}>
                    <AddParking />
                  </ProtectedRoute>
                }
              />
              <Route
                path="landowner/listings/:id/slots"
                element={
                  <ProtectedRoute roles={["landowner"]}>
                    <ManageSlots />
                  </ProtectedRoute>
                }
              />
              <Route
                path="landowner/scanner"
                element={
                  <ProtectedRoute roles={["landowner"]}>
                    <ScannerPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="landowner/earnings"
                element={
                  <ProtectedRoute roles={["landowner"]}>
                    <Earnings />
                  </ProtectedRoute>
                }
              />

              {/* Admin */}
              <Route
                path="admin"
                element={
                  <ProtectedRoute roles={["admin"]}>
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />

              {/* Shared */}
              <Route
                path="profile"
                element={
                  <ProtectedRoute roles={["customer", "landowner", "admin"]}>
                    <Profile />
                  </ProtectedRoute>
                }
              />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </RealtimeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
