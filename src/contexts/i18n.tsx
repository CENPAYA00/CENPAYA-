import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Lang = "en" | "fr";

/* ================= Dictionary (English -> French) ================= */
const FR: Record<string, string> = {
  // navigation & general
  "Home": "Accueil", "Market": "Marché", "Marketplace": "Marché", "Chat": "Chat", "Profile": "Profil", "Messages": "Messages", "Freelance": "Freelance",
  "Freelance Services": "Services freelance", "Search": "Rechercher", "Search people, products, posts...": "Rechercher des personnes, produits, publications...",
  "Search products, sellers...": "Rechercher des produits, vendeurs...", "Search services, freelancers...": "Rechercher des services, freelances...",
  "Search messages...": "Rechercher des messages...", "Type a message...": "Écrire un message...", "Write a comment...": "Écrire un commentaire...",
  "Hide demo": "Masquer la démo", "Show demo": "Afficher la démo", "Sell": "Vendre", "Sell a service": "Vendre un service", "DEMO": "DÉMO",
  "Available everywhere — no country limits": "Disponible partout — sans limite de pays", "All": "Tout", "Cancel": "Annuler", "Save": "Enregistrer",
  "Edit": "Modifier", "Remove": "Retirer", "Delete": "Supprimer", "Close": "Fermer", "Back": "Retour", "Next": "Suivant", "Done": "Terminé", "Loading...": "Chargement...",
  "Send": "Envoyer", "Copy": "Copier", "Show": "Afficher", "Hide": "Masquer", "Active": "Actif", "Off": "Désactivé", "Online": "En ligne", "Not set": "Non défini", "Set": "Défini",
  // social
  "Like": "J’aime", "Comment": "Commenter", "Comments": "Commentaires", "Share": "Partager", "Follow": "Suivre", "Following": "Abonné", "Followers": "Abonnés",
  "Posts": "Publications", "Publications": "Publications", "Archive": "Archiver", "LIVE": "EN DIRECT", "Create Post": "Créer une publication", "Your Story": "Votre story",
  "Groups": "Groupes", "Live": "En direct", "No comments yet. Be the first!": "Aucun commentaire. Soyez le premier !", "View post": "Voir la publication",
  "Voice message": "Message vocal", "Photo": "Photo", "Not sent": "Non envoyé", "Today": "Aujourd’hui", "Yesterday": "Hier", "Say hello 👋": "Dites bonjour 👋",
  "Tap a profile above to start a conversation.": "Touchez un profil ci-dessus pour démarrer une conversation.", "No messages yet": "Aucun message", "No results": "Aucun résultat",
  // drawer menu
  "MARKETPLACE": "MARCHÉ", "Create listing": "Créer une annonce", "Boost": "Booster", "Coupons": "Coupons", "SOCIAL": "SOCIAL", "Communities": "Communautés", "Reels": "Reels",
  "Saved": "Enregistrés", "SUPPORT": "SUPPORT", "Contact Support Agents": "Contacter les agents du support", "Contact Admin": "Contacter l’admin", "Support Hub": "Centre d’aide",
  "SETTINGS & LEGAL": "PARAMÈTRES ET MENTIONS LÉGALES", "Settings": "Paramètres", "Terms of Service": "Conditions d’utilisation", "Privacy Policy": "Politique de confidentialité",
  "Security Policy": "Politique de sécurité", "Refund Policy": "Politique de remboursement", "Subscription Terms": "Conditions d’abonnement", "Log Out": "Se déconnecter",
  "Logout": "Déconnexion", "FREE MEMBER": "MEMBRE GRATUIT", "★ PREMIUM MEMBER": "★ MEMBRE PREMIUM", "Go Premium": "Passer à Premium", "WALLET": "PORTEFEUILLE", "Wallet": "Portefeuille",
  // referrals & wallet
  "Referrals": "Parrainages", "AVAILABLE TO WITHDRAW": "DISPONIBLE AU RETRAIT", "Withdraw": "Retirer", "Total": "Total", "Subscribed": "Abonnés", "Earned": "Gagné",
  "Your referral link": "Votre lien de parrainage", "Copy & Share": "Copier et partager", "Withdrawal preferences": "Préférences de retrait", "Country": "Pays",
  "Withdrawal method": "Méthode de retrait", "Mobile Money Number": "Numéro Mobile Money", "Save preferences": "Enregistrer les préférences", "Your Referrals": "Vos parrainages",
  "No referrals yet": "Aucun parrainage pour le moment", "Share your link to start earning 1,000 XAF per subscriber.": "Partagez votre lien pour gagner 1 000 XAF par abonné.",
  "AVAILABLE BALANCE": "SOLDE DISPONIBLE", "Top Up": "Recharger", "REFERRALS": "PARRAINAGES", "See more": "Voir plus", "MoMo Number": "Numéro MoMo", "Provider": "Opérateur",
  "Save MoMo details": "Enregistrer les infos MoMo", "COMMUNITY": "COMMUNAUTÉ", "Email Support": "Support par e-mail", "My Wallet": "Mon portefeuille", "Deposit": "Dépôt",
  "Transfer": "Transfert", "History": "Historique", "Recent Transactions": "Transactions récentes", "Marketplace Sale": "Vente sur le marché", "Withdrawal": "Retrait", "Referral Bonus": "Bonus de parrainage",
  // premium & boost
  "Upgrade to Premium": "Passer à Premium", "Unlock lower fees and powerful features on CenPaya.": "Débloquez des frais réduits et des fonctionnalités puissantes sur CenPaya.",
  "PREMIUM PLAN": "FORMULE PREMIUM", "One-time yearly payment": "Paiement annuel unique", "What you unlock": "Ce que vous débloquez", "Reduced marketplace fees": "Frais de marché réduits",
  "3% + 25 XAF instead of 5% + 50 XAF.": "3 % + 25 XAF au lieu de 5 % + 50 XAF.", "Verified seller badge": "Badge vendeur vérifié",
  "Build buyer trust with a check mark on your profile.": "Gagnez la confiance des acheteurs avec une coche sur votre profil.", "Earn more from referrals": "Gagnez plus avec le parrainage",
  "Premium members earn 1,000 XAF per referred subscriber. Free members earn 500 XAF.": "Les membres Premium gagnent 1 000 XAF par abonné parrainé. Les membres gratuits gagnent 500 XAF.",
  "Free monthly boosts": "Boosts mensuels gratuits", "Promote one listing per month at no cost.": "Promouvez une annonce par mois gratuitement.", "Free vs Premium": "Gratuit vs Premium",
  "FEATURE": "FONCTIONNALITÉ", "FREE": "GRATUIT", "PRO": "PRO", "List products": "Publier des produits", "Reduced fees (3%+25)": "Frais réduits (3 %+25)", "Verified badge": "Badge vérifié",
  "Referral bonus": "Bonus de parrainage", "Free monthly boosts ": "Boosts mensuels gratuits", "Choose your payment method": "Choisissez votre mode de paiement", "METHOD": "MÉTHODE", "FEE": "FRAIS",
  "Pay from Wallet": "Payer avec le portefeuille", "Subscription renews yearly. Cancel anytime from Settings.": "L’abonnement se renouvelle chaque année. Annulable à tout moment dans les paramètres.",
  "CHOOSE WHAT TO BOOST": "CHOISISSEZ QUOI BOOSTER", "POSTS": "PUBLICATIONS", "LISTINGS": "ANNONCES", "SERVICES": "SERVICES", "National": "National", "Global": "Mondial", "EVERYWHERE": "PARTOUT", "COUNTRY": "PAYS",
  "Boost this listing": "Booster cette annonce", "Boost this service": "Booster ce service", "Free boost": "Boost gratuit", "No posts yet": "Aucune publication", "Publish a post first, then boost it here.": "Publiez d’abord, puis boostez ici.",
  // service creation
  "Titre du service": "Titre du service", "Catégorie": "Catégorie", "Documents (optional)": "Documents (facultatif)", "Add document": "Ajouter un document", "Use price range": "Utiliser une fourchette de prix",
  // categories
  "Writing": "Rédaction", "Design": "Design", "Business": "Affaires", "Software": "Logiciel", "Translation": "Traduction", "Freelance Design": "Design freelance", "Tutoring": "Cours particuliers",
  "Repairs": "Réparations", "Event Planning": "Organisation d’événements", "Photography": "Photographie", "Ebooks": "Livres numériques", "Poems": "Poèmes", "Electronics": "Électronique", "Fashion": "Mode",
  "Services": "Services", "Home & Living": "Maison et vie", "Vehicles": "Véhicules", "Food": "Alimentation",
  // auth
  "Welcome back": "Bon retour", "Email Address": "Adresse e-mail", "Password": "Mot de passe", "Forgot password?": "Mot de passe oublié ?", "Log In": "Se connecter", "Create an account": "Créer un compte",
  "New to CenPaya?": "Nouveau sur CenPaya ?", "Create your account": "Créez votre compte", "First name": "Prénom", "Last name": "Nom", "Gender": "Sexe", "Date of birth": "Date de naissance",
  "Confirm password": "Confirmer le mot de passe", "Create account": "Créer un compte", "Already have an account?": "Vous avez déjà un compte ?",
  // admin panel
  "Overview": "Aperçu", "Inbox": "Boîte de réception", "Reports": "Signalements", "Ledger": "Registre", "Methods": "Méthodes", "Escrow": "Séquestre", "Vault": "Coffre", "Finance": "Finances",
  "Regions": "Régions", "Features": "Fonctionnalités", "Users": "Utilisateurs", "Staff": "Équipe", "Permissions": "Autorisations", "Security": "Sécurité", "Audit": "Audit", "Tickets": "Tickets",
  "Back to app": "Retour à l’application", "SUPER ADMIN": "SUPER ADMIN", "STAFF": "ÉQUIPE", "Platform Overview": "Aperçu de la plateforme", "TOTAL USERS": "UTILISATEURS TOTAUX",
  "ACTIVE LISTINGS": "ANNONCES ACTIVES", "TOTAL ORDERS": "COMMANDES TOTALES", "PLATFORM GAINS": "GAINS DE LA PLATEFORME", "MONEY IN CIRCULATION": "ARGENT EN CIRCULATION",
  "TOTAL CIRCULATING": "TOTAL EN CIRCULATION", "Wallets + referral lock + escrow held": "Portefeuilles + parrainage verrouillé + séquestre", "WALLET BALANCES": "SOLDES DES PORTEFEUILLES",
  "ORDERS ESCROW": "SÉQUESTRE COMMANDES", "SERVICES ESCROW": "SÉQUESTRE SERVICES", "GAINS TOTAL": "TOTAL DES GAINS", "REFERRAL LOCKED": "PARRAINAGE VERROUILLÉ", "PENDING WITHDRAWALS": "RETRAITS EN ATTENTE",
  "Quick actions": "Actions rapides", "Open inbox": "Ouvrir la boîte", "View ledger": "Voir le registre", "Platform Finance": "Finances de la plateforme", "Gains, fees, regions, and wallet.": "Gains, frais, régions et portefeuille.",
  "TOTAL PLATFORM GAINS": "GAINS TOTAUX DE LA PLATEFORME", "Gains": "Gains", "Fees": "Frais", "AVAILABLE PLATFORM GAINS": "GAINS DISPONIBLES", "Move gains to your wallet": "Transférer les gains vers votre portefeuille",
  "Amount": "Montant", "Move": "Transférer", "Moves platform gains into your admin wallet.": "Transfère les gains de la plateforme vers votre portefeuille admin.", "Gains breakdown": "Détail des gains",
  "Marketplace fees": "Frais du marché", "Boost fees": "Frais de boost", "Withdrawal fees": "Frais de retrait", "API Vault": "Coffre d’API", "Payment gateways": "Passerelles de paiement",
  "Mobile money & card aggregators": "Agrégateurs mobile money et cartes", "SMS providers": "Fournisseurs SMS", "Email providers": "Fournisseurs e-mail", "Transactional email": "E-mails transactionnels",
  "PROVIDER": "FOURNISSEUR", "STATUS": "STATUT", "KEYS": "CLÉS", "No open escrows.": "Aucun séquestre ouvert.", "Orders": "Commandes", "Add country": "Ajouter un pays", "Methods ": "Méthodes",
  "Advanced Identity Verification Module": "Module avancé de vérification d’identité", "Premium Discount Vouchers": "Bons de réduction Premium", "Live Support Ticket Chat": "Chat de support en direct",
  "Delivery Service": "Service de livraison", "Enable in-app delivery management. Requires delivery partners configured.": "Active la gestion des livraisons dans l’app. Nécessite des partenaires de livraison configurés.",
  "Voice Calls": "Appels vocaux", "In-app voice calls between users": "Appels vocaux dans l’app entre utilisateurs", "Voice Notes": "Messages vocaux", "Send voice notes in chats": "Envoyer des messages vocaux dans les discussions",
  "Bank Transfers": "Virements bancaires", "Allow withdrawals to bank accounts": "Autoriser les retraits vers des comptes bancaires", "International Payments": "Paiements internationaux",
  "Accept card payments via Flutterwave": "Accepter les paiements par carte via Flutterwave", "Staff Permissions": "Autorisations de l’équipe", "Grant specific powers to staff. Only the owner can do this.": "Accordez des pouvoirs spécifiques à l’équipe. Seul le propriétaire peut le faire.",
  "-- Choose a staff member --": "-- Choisir un membre de l’équipe --", "Grant permissions to": "Accorder des autorisations à", "Promote users to support agents": "Promouvoir des utilisateurs en agents de support", "Make agent": "Nommer agent",
  "Admin Access": "Accès administrateur", "Second factor required before entering /admin.": "Second facteur requis avant d’entrer dans /admin.", "This password is separate from your login.": "Ce mot de passe est distinct de votre connexion.",
  "Create admin password": "Créer le mot de passe admin", "New password": "Nouveau mot de passe", "Confirm new password": "Confirmer le nouveau mot de passe", "At least 8 characters": "Au moins 8 caractères", "Repeat password": "Répéter le mot de passe",
  "Every admin action is permanently recorded here.": "Chaque action admin est enregistrée ici de façon permanente.", "View Changes": "Voir les modifications", "YOUR ROLE": "VOTRE RÔLE", "Support Agent": "Agent de support",
  "All open": "Tous ouverts", "Assigned to me": "Assignés à moi", "No open tickets": "Aucun ticket ouvert", "No tickets assigned to you": "Aucun ticket ne vous est assigné", "open": "ouvert", "in progress": "en cours",
  "resolved": "résolu", "under review": "en cours d’examen", "dismissed": "rejeté", "critical": "critique", "No reports in this view.": "Aucun signalement dans cette vue.", "No open escrows": "Aucun séquestre ouvert",
  // Fallback keys from your old system
  "create_your_account": "Créez votre compte", "first_name": "Prénom", "last_name": "Nom", "email_address": "Adresse e-mail",
  "gender": "Sexe", "select": "Sélectionner", "male": "Homme", "female": "Femme", "other": "Autre", "prefer_not_to_say": "Préfère ne pas dire",
  "date_of_birth": "Date de naissance", "password": "Mot de passe", "password_must_8": "Doit contenir 8 caractères", "password_must_letter": "Doit contenir une lettre",
  "password_must_number": "Doit contenir un chiffre", "confirm_password": "Confirmer le mot de passe", "i_agree_to": "J'accepte la", "privacy_policy": "Politique de confidentialité",
  "terms_and_conditions": "Conditions générales", "creating_account": "Création du compte...", "create_account": "Créer un compte", "already_have_account": "Vous avez déjà un compte ?",
  "login": "Se connecter", "by_signing_up": "En vous inscrivant, vous acceptez nos Conditions générales et notre Politique de confidentialité.",
  "must_be_13": "Vous devez avoir au moins 13 ans.", "loading": "Chargement...", "post": "Publier", "posting": "Publication...", "create_post": "Créer une publication",
  "whats_on_your_mind": "À quoi pensez-vous ?", "add_photos": "Photos", "feeling": "Humeur", "background": "Arrière-plan", "colors_disabled": "Les couleurs sont désactivées pour les textes longs",
  "colors_available": "Couleurs disponibles", "share": "Partager", "comments": "Commentaires", "no_comments": "Aucun commentaire", "write_comment": "Écrire un commentaire...",
  "no_results": "Aucun résultat", "share_profile": "Partager", "settings": "Paramètres", "member_since": "Membre depuis", "premium_member": "Membre Premium",
  "free_member": "Membre Gratuit", "posts": "Publications", "followers": "Abonnés", "following": "Abonnements", "all": "Tout", "create_listing": "Créer une annonce", "no_services": "Aucun service",
  "create_service": "Créer un service"
};

const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^(\d+) days$/i, (m) => `${m[1]} jours`], [/^(\d+) shares?$/i, (m) => `${m[1]} partage${+m[1] > 1 ? "s" : ""}`], [/^(\d+) total$/i, (m) => `${m[1]} au total`],
  [/^(\d+) events$/i, (m) => `${m[1]} événements`], [/^(\d+)d$/, (m) => `${m[1]} j`], [/^You: ([\s\S]*)$/, (m) => `Vous : ${m[1]}`], [/^Balance: (.*)$/, (m) => `Solde : ${m[1]}`],
  [/^From ([\d,]+) XAF$/i, (m) => `À partir de ${m[1]} XAF`], [/^Earn ([\d,]+) XAF per referred subscriber$/i, (m) => `Gagnez ${m[1]} XAF par abonné parrainé`],
  [/^Locked: (\d+) · Received: (\d+)$/i, (m) => `Verrouillé : ${m[1]} · Reçu : ${m[2]}`], [/^Earned: (.*)$/, (m) => `Gagné : ${m[1]}`], [/^Withdrawn: (.*)$/, (m) => `Retiré : ${m[1]}`],
  [/^Ranked: (.*) first · boosted on top$/i, (m) => `Classé : ${m[1]} d’abord · boostés en premier`], [/^(\d+) active · (\d+) total$/i, (m) => `${m[1]} actifs · ${m[2]} au total`],
  [/^(\d+) tickets? · (\d+) unread$/i, (m) => `${m[1]} ticket(s) · ${m[2]} non lu(s)`], [/^Current staff \((\d+)\)$/i, (m) => `Équipe actuelle (${m[1]})`], [/^Updated (.*)$/, (m) => `Mis à jour ${m[1]}`],
  [/^Actor: (.*)$/, (m) => `Auteur : ${m[1]}`], [/^Table: (.*)$/, (m) => `Table : ${m[1]}`], [/^(\d+) in this view$/, (m) => `${m[1]} dans cette vue`], [/^View all (\d+) comments$/i, (m) => `Voir les ${m[1]} commentaires`],
  [/^(\d+) (referrals?|posts?)$/i, (m) => `${m[1]} ${/ref/i.test(m[2]) ? "parrainage(s)" : "publication(s)"}`], [/^Must contain (\d+) characters$/i, (m) => `Doit contenir ${m[1]} caractères`],
];

const LOWER = new Map(Object.entries(FR).map(([k, v]) => [k.trim().toLowerCase(), v]));

export function translate(src: string): string | null {
  const key = src.trim(); if (!key || /^[\d\s.,:%+\-–—/·•()€$]+$/.test(key)) return null;
  const lead = src.slice(0, src.indexOf(key)); const tail = src.slice(src.indexOf(key) + key.length);
  let out = LOWER.get(key.toLowerCase()) ?? null;
  if (out && key === key.toUpperCase() && /[A-Z]/.test(key)) out = out.toUpperCase(); 
  if (!out) for (const [re, fn] of PATTERNS) { const m = key.match(re); if (m) { out = fn(m); break; } }
  return out ? lead + out + tail : null;
}

/* ================= Auto-translator ================= */
const SKIP = "script,style,textarea,code,pre,[data-no-translate],[contenteditable=true]";
const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;
const origText = new WeakMap<Node, string>();
const origAttr = new WeakMap<Element, Record<string, string>>();

function applyText(n: Node, lang: Lang): void {
  const p = n.parentElement; if (!p || p.closest(SKIP)) return;
  const cur = n.nodeValue ?? "";
  if (lang === "fr") { 
    const out = translate(cur); 
    if (out && out !== cur) { 
      if (!origText.has(n) || translate(origText.get(n)!) !== out) origText.set(n, cur); 
      n.nodeValue = out; 
    } 
  } else if (origText.has(n)) { 
    n.nodeValue = origText.get(n)!; 
    origText.delete(n); 
  }
}

function applyAttrs(el: Element, lang: Lang): void {
  if (el.closest(SKIP)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a); const saved = origAttr.get(el) ?? {};
    if (lang === "fr" && v) { 
      const out = translate(v); 
      if (out && out !== v) { saved[a] = saved[a] ?? v; origAttr.set(el, saved); el.setAttribute(a, out); } 
    } else if (lang === "en" && saved[a]) { 
      el.setAttribute(a, saved[a]); delete saved[a]; 
    }
  }
}

function walk(root: Node, lang: Lang): void {
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n: Node | null;
  while ((n = tw.nextNode())) applyText(n, lang);
  if (root instanceof Element) { applyAttrs(root, lang); root.querySelectorAll("[placeholder],[title],[aria-label],[alt]").forEach((e) => applyAttrs(e, lang)); }
}

const AutoTranslate: React.FC<{ lang: Lang }> = ({ lang }) => {
  useEffect(() => {
    walk(document.body, lang);
    const pending = new Set<Node>(); let raf = 0;
    const flush = () => { raf = 0; pending.forEach((n) => { if (n.isConnected) { if (n.nodeType === 3) applyText(n, lang); else walk(n, lang); } }); pending.clear(); };
    const mo = new MutationObserver((ms) => {
      for (const m of ms) { if (m.type === "characterData") pending.add(m.target); else if (m.type === "attributes") pending.add(m.target); else m.addedNodes.forEach((a) => pending.add(a)); }
      if (!raf) raf = requestAnimationFrame(flush);
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
    document.documentElement.lang = lang;
    return () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [lang]);
  return null;
};

/* ================= Context ================= */
interface Ctx { lang: Lang; setLang: (l: Lang) => void; toggleLang: () => void; t: (s: string, vars?: any) => string }
const I18n = createContext<Ctx>({ lang: "en", setLang: () => undefined, toggleLang: () => undefined, t: (s) => s });

export const useI18n = (): Ctx => useContext(I18n);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, 
