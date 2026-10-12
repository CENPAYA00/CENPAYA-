import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import AdminLayout from './components/AdminLayout';

import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import Legal from './pages/Legal';

import Home from './pages/Home';
import Market from './pages/Market';
import Wallet from './pages/Wallet';
import WalletTopup from './pages/WalletTopup';
import Withdraw from './pages/Withdraw';
import Subscribe from './pages/Subscribe';
import Referrals from './pages/Referrals';
import Profile from './pages/Profile';
import SellerProfile from './pages/SellerProfile';
import CreatePost from './pages/CreatePost';
import CreateListing from './pages/CreateListing';
import ListingDetail from './pages/ListingDetail';
import OrderDetail from './pages/OrderDetail';
import PostView from './pages/PostView';
import Chat from './pages/Chat';
import ChatThread from './pages/ChatThread';
import SupportDashboard from './pages/SupportDashboard';
import Settings from './pages/Settings';
import MyPosts from './pages/MyPosts';
import MyListings from './pages/MyListings';
import MyOrders from './pages/MyOrders';
import Services from './pages/Services';
import Boosted from './pages/Boosted';
import Coupons from './pages/Coupons';
import Pages from './pages/Pages';
import Groups from './pages/Groups';
import Reels from './pages/Reels';
import Saved from './pages/Saved';
import ContactAdmin from './pages/ContactAdmin';

import SuperAdminDashboard from './pages/SuperAdminDashboard';
import AdminVault from './pages/admin/AdminVault';
import AdminFinance from './pages/admin/AdminFinance';
import AdminFeatures from './pages/admin/AdminFeatures';
import AdminUsers from './pages/admin/AdminUsers';
import AdminAuditLogViewer from './pages/admin/AdminAuditLog';
import AdminPermissions from './pages/admin/AdminPermissions';
import AdminRegions from './pages/admin/AdminRegions';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/legal/:slug" element={<Legal />} />

        <Route element={<Layout />}>
          <Route path="/home" element={<Home />} />
          <Route path="/market" element={<Market />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/wallet/topup" element={<WalletTopup />} />
          <Route path="/withdraw" element={<Withdraw />} />
          <Route path="/subscribe" element={<Subscribe />} />
          <Route path="/referrals" element={<Referrals />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/seller/:id" element={<SellerProfile />} />
          <Route path="/create-post" element={<CreatePost />} />
          <Route path="/create-listing" element={<CreateListing />} />
          <Route path="/listing/:id" element={<ListingDetail />} />
          <Route path="/order/:id" element={<OrderDetail />} />
          <Route path="/post/:id" element={<PostView />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/chat/:id" element={<ChatThread />} />
          <Route path="/support" element={<SupportDashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/my-posts" element={<MyPosts />} />
          <Route path="/my-listings" element={<MyListings />} />
          <Route path="/my-orders" element={<MyOrders />} />
          <Route path="/services" element={<Services />} />
          <Route path="/boosted" element={<Boosted />} />
          <Route path="/coupons" element={<Coupons />} />
          <Route path="/pages" element={<Pages />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/reels" element={<Reels />} />
          <Route path="/saved" element={<Saved />} />
          <Route path="/contact-admin" element={<ContactAdmin />} />
        </Route>

        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<SuperAdminDashboard />} />
          <Route path="/admin/vault" element={<AdminVault />} />
          <Route path="/admin/finance" element={<AdminFinance />} />
          <Route path="/admin/features" element={<AdminFeatures />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/audit" element={<AdminAuditLogViewer />} />
          <Route path="/admin/permissions" element={<AdminPermissions />} />
          <Route path="/admin/regions" element={<AdminRegions />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
            }
