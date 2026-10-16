import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const DEMO_REPLIES = [
  "Yes, it's still available 👍",
  "Sure! When would you like to pick it up?",
  "Thanks for reaching out!",
  "Great, let me check and get back to you.",
  "Yes please — that works for me.",
  "Can you share your phone number?",
  "I can deliver it. What's your area?",
  "The price is negotiable if you're serious.",
  "Perfect. Let's arrange a time.",
  "Sorry, just saw your message. Still interested?",
  "Yes! I have it in stock.",
  "Payment via escrow is fine with me.",
  "I'm available tomorrow if that works.",
  "Sounds good — sending details shortly.",
  "Thank you! Let me know if you have questions.",
];

const DEMO_REPLIES_FR = [
  "Oui, c'est toujours disponible 👍",
  "Bien sûr ! Quand voulez-vous le récupérer ?",
  "Merci de m'avoir contacté !",
  "Parfait, je vérifie et je reviens vers vous.",
  "Oui, ça me convient.",
  "Pouvez-vous partager votre numéro de téléphone ?",
  "Je peux livrer. Quelle est votre zone ?",
  "Le prix est négociable si vous êtes sérieux.",
  "Parfait. Organisons un moment.",
  "Désolé, je viens de voir votre message. Toujours intéressé ?",
  "Oui ! Je l'ai en stock.",
  "Le paiement par séquestre me convient.",
  "Je suis disponible demain si ça marche.",
  "Ça marche — j'envoie les détails bientôt.",
  "Merci ! Faites-moi savoir si vous avez des questions.",
];

type Args = {
  channelId: string | undefined;
  otherUsername: string | null | undefined;
  messages: any[];
  myUserId: string | null;
};

export function useDemoAutoReply({ channelId, otherUsername, messages, myUserId }: Args) {
  const lastRepliedAt = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);

  useEffect(() => {
    if (!channelId || !myUserId || !otherUsername) return;
    if (messages.length === 0) return;

    // Only reply if the other party is a demo account
    const isDemo = otherUsername.endsWith('_demo') || otherUsername === 'cenpaya';
    if (!isDemo) return;

    // Only reply if the last message is from me (the real user)
    const last = messages[messages.length - 1];
    if (!last || last.sender_id !== myUserId) return;

    // Rate-limit: max one reply every 10 seconds
    const now = Date.now();
    if (now - lastRepliedAt.current < 10_000) return;
    if (inFlightRef.current) return;

    inFlightRef.current = true;

    // Human-like delay: 2–4 seconds
    const delay = 2000 + Math.random() * 2000;

    const timer = setTimeout(async () => {
      try {
        // Pick a reply (respect i18n if you want — EN here)
        const pool = Math.random() < 0.9 ? DEMO_REPLIES : DEMO_REPLIES_FR;
        const body = pool[Math.floor(Math.random() * pool.length)];

        // Get demo user's id from participants
        const { data: participants } = await supabase
          .from('chat_participants')
          .select('user_id')
          .eq('channel_id', channelId)
          .neq('user_id', myUserId)
          .maybeSingle();

        const demoUserId = participants?.user_id;
        if (!demoUserId) return;

        // Insert the reply
        await supabase.from('chat_messages').insert({
          channel_id: channelId,
          sender_id: demoUserId,
          body,
          message_type: 'text',
        });

        lastRepliedAt.current = Date.now();
      } catch (e) {
        console.warn('demo auto-reply failed', e);
      } finally {
        inFlightRef.current = false;
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [channelId, otherUsername, messages, myUserId]);
}
