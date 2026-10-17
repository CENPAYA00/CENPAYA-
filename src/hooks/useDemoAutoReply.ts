/* src/hooks/useDemoAutoReply.ts */
import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const DEMO_REPLIES = [
  "Yes, it's still available 👍",
  'Sure! When would you like to pick it up?',
  'Thanks for reaching out!',
  'Great, let me check and get back to you.',
  'Yes please — that works for me.',
  'Can you share your phone number?',
  "I can deliver it. What's your area?",
  "The price is negotiable if you're serious.",
  "Perfect. Let's arrange a time.",
  'Sorry, just saw your message. Still interested?',
  'Yes! I have it in stock.',
  'Payment via escrow is fine with me.',
  "I'm available tomorrow if that works.",
  'Sounds good — sending details shortly.',
  'Thank you! Let me know if you have questions.',
];

const DEMO_REPLIES_FR = [
  "Oui, c'est toujours disponible 👍",
  'Bien sûr ! Quand voulez-vous le récupérer ?',
  "Merci de m'avoir contacté !",
  'Parfait, je vérifie et je reviens vers vous.',
  'Oui, ça me convient.',
  'Pouvez-vous partager votre numéro de téléphone ?',
  'Je peux livrer. Quelle est votre zone ?',
  'Le prix est négociable si vous êtes sérieux.',
  'Parfait. Organisons un moment.',
  'Désolé, je viens de voir votre message. Toujours intéressé ?',
  "Oui ! Je l'ai en stock.",
  'Le paiement par séquestre me convient.',
  'Je suis disponible demain si ça marche.',
  "Ça marche — j'envoie les détails bientôt.",
  'Merci ! Faites-moi savoir si vous avez des questions.',
];

type DemoMessage = { id: string; sender_id: string; created_at: string };

type DemoArgs = {
  channelId: string | undefined;
  otherUsername: string | null | undefined;
  messages: DemoMessage[];
  myUserId: string | null;
};

type ParticipantRow = { user_id: string };

export function useDemoAutoReply({
  channelId,
  otherUsername,
  messages,
  myUserId,
}: DemoArgs): void {
  const lastRepliedAt = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);
  const lastSeenId = useRef<string | null>(null); // ADDED

  useEffect(() => {
    if (!channelId || !myUserId || !otherUsername) return;
    if (messages.length === 0) return;

    const isDemo =
      otherUsername.endsWith('_demo') || otherUsername === 'cenpaya';
    if (!isDemo) return;

    const last = messages[messages.length - 1];
    if (!last || last.sender_id !== myUserId) return;

    if (lastSeenId.current === last.id) return;

    const age = Date.now() - new Date(last.created_at).getTime();
    if (age > 60_000) return;

    const now = Date.now();
    if (now - lastRepliedAt.current < 10_000) return;
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    lastSeenId.current = last.id;

    const delay = 2000 + Math.random() * 2000;

    const timer = setTimeout(async () => {
      try {
        const pool = Math.random() < 0.9 ? DEMO_REPLIES : DEMO_REPLIES_FR;
        const body = pool[Math.floor(Math.random() * pool.length)];

        const { data: participants } = await supabase
          .from('chat_participants')
          .select('user_id')
          .eq('channel_id', channelId)
          .neq('user_id', myUserId)
          .maybeSingle<ParticipantRow>();

        const demoUserId = participants?.user_id;
        if (!demoUserId) return;

        await supabase.from('chat_messages').insert({
          channel_id: channelId,
          sender_id: demoUserId,
          body,
          message_type: 'text',
        });

        lastRepliedAt.current = Date.now();
      } catch (e: unknown) {
        console.warn('demo auto-reply failed', e);
      } finally {
        inFlightRef.current = false;
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [channelId, otherUsername, messages.length, myUserId]);
            }
