import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'; // ADDED useNavigate
import { lazy, Suspense, useEffect } from 'react'; // ADDED useEffect
import { supabase } from './lib/supabase'; // ADDED supabase
import Layout from './components/Layout';
import AdminLayout from './components/AdminLayout';
import StaffLayout from './components/StaffLayout';

// --- LAZY LOADING ALL PAGES ---
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const Legal = lazy(() => import('./pages/Legal'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const VerifyOtp = lazy(() => import('./pages/VerifyOtp'));
const CompleteProfile = lazy(() => import('./pages/CompleteProfile')); // ADDED THIS

const Home = lazy(() => import('./pages/Home'));
const Market = lazy(() => import('./pages/Market'));
const Checkout = lazy(() => import('./pages/Checkout'));
const Wallet = lazy(() => import('./pages/Wallet'));
const WalletTopup = lazy(() => import('./pages/WalletTopup'));
const Withdraw = lazy(() => import('./pages/Withdraw'));
const Subscribe = lazy(() => import('./pages/Subscribe'));
const Referrals = lazy(() => import('./pages/Referrals'));
const ReferralWithdraw = lazy(() => import('./pages/ReferralWithdraw'));
const Profile = lazy(() => import('./pages/Profile'));
const ProfileFollowers = lazy(() => import('./pages/ProfileFollowers'));
const ProfileFollowing = lazy(() => import('./pages/ProfileFollowing'));
const SellerProfile = lazy(() => import('./pages/SellerProfile'));
const CreatePost = lazy(() => import('./pages/CreatePost'));
const CreateListing = lazy(() => import('./pages/CreateListing'));
const ListingDetail = lazy(() => import('./pages/ListingDetail'));
const StaffPanel = lazy(() => import('./pages/StaffPanel'));
const OrderDetail = lazy(() => import('./pages/OrderDetail'));
const PostView = lazy(() => import('./pages/PostView'));
const Chat = lazy(() => import('./pages/Chat'));
const Search = lazy(() => import('./pages/Search'));
const ChatThread = lazy(() => import('./pages/ChatThread'));
const SupportDashboard = lazy(() => import('./pages/SupportDashboard'));
const Settings = lazy(() => import('./pages/Settings'));
const SettingsReport = lazy(() => import('./pages/SettingsReport'));
const SettingsPersonal = lazy(() => import('./pages/SettingsPersonal'));
const SettingsSecurity = lazy(() => import('./pages/SettingsSecurity'));
const SettingsVerification = lazy(() => import('./pages/SettingsVerification'));
const SettingsNotifications = lazy(() => import('./pages/SettingsNotifications'));
const SettingsPrivacy = lazy(() => import('./pages/SettingsPrivacy'));
const SettingsDetails = lazy(() => import('./pages/SettingsDetails'));
const SettingsTagging = lazy(() => import('./pages/SettingsTagging'));
const SettingsBlocking = lazy(() => import('./pages/SettingsBlocking'));
const SettingsAccount = lazy(() => import('./pages/SettingsAccount'));
const ContactSupport = lazy(() => import('./pages/ContactSupport'));
const MyPosts = lazy(() => import('./pages/MyPosts'));
const MyListings = lazy(() => import('./pages/MyListings'));
const MyOrders = lazy(() => import('./pages/MyOrders'));
const Services = lazy(() => import('./pages/Services'));
const CreateService = lazy(() => import('./pages/CreateService'));
const ServiceDetail = lazy(() => import('./pages/ServiceDetail'));
const ServiceOrder = lazy(() => import('./pages/ServiceOrder'));
const Boosted = lazy(() => import('./pages/Boosted'));
const Coupons = lazy(() => import('./pages/Coupons'));
const Reels = lazy(() => import('./pages/Reels'));
const Saved = lazy(() => import('./pages/Saved'));
const ContactAdmin = lazy(() => import('./pages/ContactAdmin'));
const ContactThread = lazy(() => import('./pages/ContactThread'));
const StaffTicketThread = lazy(() => import('./pages/StaffTicketThread'));
const StaffReports = lazy(() => import('./pages/StaffReports'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Follow = lazy(() => import('./pages/Follow'));
const Groups = lazy(() => import('./pages/Groups'));
const GroupDetail = lazy(() => import('./pages/GroupDetail'));
const Communities = lazy(() => import('./pages/Communities'));
const CommunityDetail = lazy(() => import('./pages/CommunityDetail'));
const JoinGroupByLink = lazy(() => import('./pages/JoinGroupByLink'));
const SuperAdminDashboard = lazy(() => import('./pages/SuperAdminDashboard'));
const AdminStaff = lazy(() => import('./pages/admin/AdminStaff'));
const StaffAccept = lazy(() => import('./pages/StaffAccept'));
const AdminVault = lazy(() => import('./pages/admin/AdminVault'));
const AdminFinance = lazy(() => import('./pages/admin/AdminFinance'));
const AdminFeatures = lazy(() => import('./pages/admin/AdminFeatures'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const AdminSecurity = lazy(() => import('./pages/admin/AdminSecurity'));
const AdminAuditLogViewer = lazy(() => import('./pages/admin/AdminAuditLog'));
const AdminPermissions = lazy(() => import('./pages/admin/AdminPermissions'));
const AdminRegions = lazy(() => import('./pages/admin/AdminRegions'));
const AdminInbox = lazy(() => import('./pages/admin/AdminInbox'));
const AdminTicketThread = lazy(() => import('./pages/admin/AdminTicketThread'));
const AdminLedger = lazy(() => import('./pages/admin/AdminLedger'));
const AdminPaymentMethods = lazy(() => import('./pages/admin/AdminPaymentMethods'));
const AdminEscrow = lazy(() => import('./pages/admin/AdminEscrow'));
const ActivityLog = lazy(() => import('./pages/ActivityLog'));
const ArchivedPosts = lazy(() => import('./pages/ArchivedPosts'));

// ADDED: The Google Auth Bouncer
function AuthListener() {
  const navigate = useNavigate();
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== 'SIGNED_IN' || !session) return;
      const u = session.user;
      const { data } = await supabase.from('users').select('onboarding_completed').eq('id', u.id).maybeSingle();
      if (!data || !data.onboarding_completed) {
        navigate('/complete-profile', { replace: true });
      }
    });
    return () => { authListener.subscription.unsubscribe(); };
  }, [navigate]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthListener /> {/* ADDED THE BOUNCER HERE */}
      
      {/* Suspense shows a loading state while the page downloads */}
      <Suspense fallback={<div className="h-screen bg-[#eef2f0] dark:bg-darkbg flex items-center justify-center text-brand font-bold">Loading...</div>}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/legal/:slug" element={<Legal />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/verify-otp" element={<VerifyOtp />} />
          <Route path="/complete-profile" element={<CompleteProfile />} /> {/* ADDED THE ROUTE HERE */}

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
            <Route path="/search" element={<Search />} />
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
            <Route path="/settings/details" element={<SettingsDetails />} />
            <Route path="/settings/tagging" element={<SettingsTagging />} />
            <Route path="/settings/blocking" element={<SettingsBlocking />} />
            <Route path="/settings/account" element={<SettingsAccount />} />

            <Route path="/contact-support" element={<ContactSupport />} />
            <Route path="/contact-support/:id" element={<ContactThread />} />
            <Route path="/contact-admin" element={<ContactAdmin />} />
            <Route path="/contact-admin/:id" element={<ContactThread />} />

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
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/follow" element={<Follow />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/groups/join/:code" element={<JoinGroupByLink />} />
            <Route path="/groups/:id" element={<GroupDetail />} />
            <Route path="/communities" element={<Communities />} />
            <Route path="/communities/:id" element={<CommunityDetail />} />

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
      </Suspense>
    </BrowserRouter>
  );
}
