import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import AdminLayout from './components/AdminLayout';

import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import Legal from './pages/Legal';
import Onboarding from './pages/Onboarding';

import Home from './pages/Home';
import Market from './pages/Market';
import Checkout from './pages/Checkout';
import Wallet from './pages/Wallet';
import WalletTopup from './pages/WalletTopup';
import Withdraw from './pages/Withdraw';
import Subscribe from './pages/Subscribe';
import Referrals from './pages/Referrals';
import ReferralWithdraw from './pages/ReferralWithdraw';
import Profile from './pages/Profile';
import ProfileFollowers from './pages/ProfileFollowers';
import ProfileFollowing from './pages/ProfileFollowing';
import SellerProfile from './pages/SellerProfile';
import CreatePost from './pages/CreatePost';
import CreateListing from './pages/CreateListing';
import ListingDetail from './pages/ListingDetail';
import StaffPanel from './pages/StaffPanel';
import OrderDetail from './pages/OrderDetail';
import PostView from './pages/PostView';
import Chat from './pages/Chat';
import ChatThread from './pages/ChatThread';
import SupportDashboard from './pages/SupportDashboard';
import Settings from './pages/Settings';
import SettingsReport from './pages/SettingsReport';
import SettingsPersonal from './pages/SettingsPersonal';
import SettingsSecurity from './pages/SettingsSecurity';
import SettingsVerification from './pages/SettingsVerification';
import SettingsNotifications from './pages/SettingsNotifications';
import SettingsPrivacy from './pages/SettingsPrivacy';
import SettingsBlocking from './pages/SettingsBlocking';
import SettingsAccount from './pages/SettingsAccount';
import ContactSupport from './pages/ContactSupport';
import MyPosts from './pages/MyPosts';
import MyListings from './pages/MyListings';
import MyOrders from './pages/MyOrders';
import Services from './pages/Services';
import CreateService from './pages/CreateService';
import ServiceDetail from './pages/ServiceDetail';
import ServiceOrder from './pages/ServiceOrder';
import Boosted from './pages/Boosted';
import Coupons from './pages/Coupons';
import Reels from './pages/Reels';
import Saved from './pages/Saved';
import ContactAdmin from './pages/ContactAdmin';
import ContactThread from './pages/ContactThread';
import StaffLayout from './components/StaffLayout';
import StaffTicketThread from './pages/StaffTicketThread';
import StaffReports from './pages/StaffReports';
import Notifications from './pages/Notifications';
import Follow from './pages/Follow';
import Groups from './pages/Groups';
import GroupDetail from './pages/GroupDetail';
import Communities from './pages/Communities';
import CommunityDetail from './pages/CommunityDetail';
import JoinGroupByLink from './pages/JoinGroupByLink';

import SuperAdminDashboard from './pages/SuperAdminDashboard';
import AdminStaff from './pages/admin/AdminStaff';
import StaffAccept from './pages/StaffAccept';
import AdminVault from './pages/admin/AdminVault';
import AdminFinance from './pages/admin/AdminFinance';
import AdminFeatures from './pages/admin/AdminFeatures';
import AdminUsers from './pages/admin/AdminUsers';
import AdminReports from './pages/admin/AdminReports';
import AdminSecurity from './pages/admin/AdminSecurity';
import AdminAuditLogViewer from './pages/admin/AdminAuditLog';
import AdminPermissions from './pages/admin/AdminPermissions';
import AdminRegions from './pages/admin/AdminRegions';
import AdminInbox from './pages/admin/AdminInbox';
import AdminTicketThread from './pages/admin/AdminTicketThread';
import AdminLedger from './pages/admin/AdminLedger';
import AdminPaymentMethods from './pages/admin/AdminPaymentMethods';
import AdminEscrow from './pages/admin/AdminEscrow';

// NEW: features M + Q
import ActivityLog from './pages/ActivityLog';
import ArchivedPosts from './pages/ArchivedPosts';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/legal/:slug" element={<Legal />} />
        <Route path="/onboarding" element={<Onboarding />} />

        <Route element={<Layout />}>
          <Route path="/home" element={<Home />} />
          <Route path="/market" element={<Market />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/wallet/topup" element={<WalletTopup />} />
          <Route path="/withdraw" element={<Withdraw />} />
          <Route path="/subscribe" element={<Subscribe />} />
          <Route path="/referrals" element={<Referrals />} />
          <Route path="/referral-withdraw" element={<ReferralWithdraw />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:id/followers" element={<ProfileFollowers />} />
          <Route path="/profile/:id/following" element={<ProfileFollowing />} />
          <Route path="/seller/:id" element={<SellerProfile />} />
          <Route path="/create-post" element={<CreatePost />} />
          <Route path="/create-listing" element={<CreateListing />} />
          <Route path="/listing/:id" element={<ListingDetail />} />
          <Route path="/order/:id" element={<OrderDetail />} />
          <Route path="/post/:id" element={<PostView />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/chat/:id" element={<ChatThread />} />
          <Route path="/support" element={<SupportDashboard />} />
          <Route path="/staff/accept/:token" element={<StaffAccept />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/report" element={<SettingsReport />} />
          <Route path="/settings/personal" element={<SettingsPersonal />} />
          <Route path="/settings/security" element={<SettingsSecurity />} />
          <Route path="/settings/verification" element={<SettingsVerification />} />
          <Route path="/settings/notifications" element={<SettingsNotifications />} />
          <Route path="/settings/privacy" element={<SettingsPrivacy />} />
          <Route path="/settings/blocking" element={<SettingsBlocking />} />
          <Route path="/settings/account" element={<SettingsAccount />} />
<Route path="/contact-support" element={<ContactSupport />} />
<Route path="/contact-support/:id" element={<ContactThread />} />
          <Route path="/my-posts" element={<MyPosts />} />
          <Route path="/my-listings" element={<MyListings />} />
          <Route path="/my-orders" element={<MyOrders />} />
          <Route path="/services" element={<Services />} />
          <Route path="/create-service" element={<CreateService />} />
          <Route path="/service/:id" element={<ServiceDetail />} />
          <Route path="/service-order/new" element={<ServiceOrder />} />
          <Route path="/service-order/:id" element={<ServiceOrder />} />
          <Route path="/boosted" element={<Boosted />} />
          <Route path="/coupons" element={<Coupons />} />
          <Route path="/reels" element={<Reels />} />
          <Route path="/saved" element={<Saved />} />
          <Route path="/contact-admin" element={<ContactAdmin />} />
          <Route path="/contact-admin/:id" element={<ContactThread />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/follow" element={<Follow />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/groups/join/:code" element={<JoinGroupByLink />} />
          <Route path="/groups/:id" element={<GroupDetail />} />
          <Route path="/communities" element={<Communities />} />
          <Route path="/communities/:id" element={<CommunityDetail />} />

          {/* NEW: features M + Q */}
          <Route path="/activity" element={<ActivityLog />} />
          <Route path="/archive" element={<ArchivedPosts />} />
        </Route>

        <Route element={<StaffLayout />}>
          <Route path="/staff" element={<StaffPanel />} />
          <Route path="/staff/tickets/:id" element={<StaffTicketThread />} />
          <Route path="/staff/reports" element={<StaffReports />} />
        </Route>

        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<SuperAdminDashboard />} />
          <Route path="/admin/staff" element={<AdminStaff />} />
          <Route path="/admin/inbox" element={<AdminInbox />} />
          <Route path="/admin/inbox/:id" element={<AdminTicketThread />} />
          <Route path="/admin/ledger" element={<AdminLedger />} />
          <Route path="/admin/payment-methods" element={<AdminPaymentMethods />} />
          <Route path="/admin/escrow" element={<AdminEscrow />} />
          <Route path="/admin/vault" element={<AdminVault />} />
          <Route path="/admin/finance" element={<AdminFinance />} />
          <Route path="/admin/features" element={<AdminFeatures />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/reports" element={<AdminReports />} />
          <Route path="/admin/security" element={<AdminSecurity />} />
          <Route path="/admin/audit" element={<AdminAuditLogViewer />} />
          <Route path="/admin/permissions" element={<AdminPermissions />} />
          <Route path="/admin/regions" element={<AdminRegions />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
