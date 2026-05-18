import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import AdminPage from "./pages/AdminPage";
import WholesalerListingsPage from "./pages/WholesalerListingsPage";
import RetailerSearchPage from "./pages/RetailerSearchPage";
import ProfilePage from "./pages/ProfilePage";
import CartPage from "./pages/CartPage";
import OrdersPage from "./pages/OrdersPage";
import OrderDetailPage from "./pages/OrderDetailPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/wholesaler/listings" element={<WholesalerListingsPage />} />
        <Route path="/retailer/search" element={<RetailerSearchPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:orderId" element={<OrderDetailPage />} />
      </Routes>
    </BrowserRouter>
  );
}
