import mongoose from 'mongoose';
import { User } from '../modules/users/user.model';
import { AppConfig } from '../modules/discovery/config.model';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

export const MOODS = [
  { id: '1', label: 'Chill', emoji: '☕', isActive: true },
  { id: '2', label: 'Venting', emoji: '🌪️', isActive: false },
  { id: '3', label: 'Happy', emoji: '✨', isActive: false },
  { id: '4', label: 'Gaming', emoji: '🎮', isActive: false },
  { id: '5', label: 'Late Night', emoji: '🌙', isActive: false },
];

export const LISTENERS = [
  {
    id: '1',
    name: 'Aisha K.',
    location: 'Mumbai',
    isLive: true,
    rating: 4.9,
    rateCoins: 10,
    videoAvailable: false,
    tags: ['Hindi', 'Music', 'Chill'],
    image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80',
  },
  {
    id: '2',
    name: 'David L.',
    location: 'London',
    isLive: true,
    rating: 4.8,
    rateCoins: 12,
    videoAvailable: true,
    tags: ['English', 'Venting', 'Life'],
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80',
  },
  {
    id: '3',
    name: 'Sarah M.',
    location: 'New York',
    isLive: true,
    rating: 4.95,
    rateCoins: 15,
    videoAvailable: true,
    tags: ['English', 'Gaming'],
    image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=256&h=256&q=80',
  },
];

export const ACTIVE_LISTENERS = [
  {
    id: '11',
    name: 'Elena R.',
    rating: 4.9,
    rateCoins: 10,
    videoAvailable: true,
    tags: ['Empathy', 'Relationships', 'Late Talk'],
    image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=256&h=256&q=80',
    location: 'Paris',
  },
  {
    id: '12',
    name: 'Marcus G.',
    rating: 4.8,
    rateCoins: 8,
    videoAvailable: false,
    tags: ['Career', 'Anxiety', 'Coaching'],
    image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=256&h=256&q=80',
    location: 'Toronto',
  },
  {
    id: '13',
    name: 'Sophia W.',
    rating: 4.95,
    rateCoins: 15,
    videoAvailable: true,
    tags: ['Deep Chat', 'Spiritual', 'Mindfulness'],
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&h=256&q=80',
    location: 'San Francisco',
  },
  {
    id: '14',
    name: 'Chloe M.',
    rating: 4.75,
    rateCoins: 10,
    videoAvailable: true,
    tags: ['Breakups', 'LGBTQ+', 'Dating'],
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=256&h=256&q=80',
    location: 'Sydney',
  },
  {
    id: '15',
    name: 'Rohan S.',
    rating: 4.9,
    rateCoins: 12,
    videoAvailable: false,
    tags: ['Self-growth', 'Meditation', 'Chill'],
    image: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=256&h=256&q=80',
    location: 'New Delhi',
  },
];

export const VIBE_CARDS = [
  {
    id: '1',
    prompt: "What's on your mind tonight?",
    subtext: "Share your late-night thoughts in a warm, judgment-free space.",
    meshColors: ['rgba(30, 27, 75, 0.85)', 'rgba(46, 16, 101, 0.85)'],
  },
  {
    id: '2',
    prompt: "Need a silent listener?",
    subtext: "Sometimes you just need to speak your thoughts aloud. We're here.",
    meshColors: ['rgba(49, 16, 66, 0.85)', 'rgba(18, 27, 58, 0.85)'],
  },
  {
    id: '3',
    prompt: "Anxious or feeling lonely?",
    subtext: "Hop onto a 1-on-1 audio connection instantly. Real voices, real hearts.",
    meshColors: ['rgba(10, 37, 64, 0.85)', 'rgba(46, 16, 101, 0.85)'],
  },
];

export const VIBE_GRID_QUESTIONS = [
  {
    id: '1',
    question: "Feeling Lonely?",
    subtitle: "Connect instantly",
    iconName: 'Heart',
    category: 'Chill',
  },
  {
    id: '2',
    question: "Need to Vent?",
    subtitle: "Share the weight",
    iconName: 'MessageSquare',
    category: 'Venting',
  },
  {
    id: '3',
    question: "Can't Sleep?",
    subtitle: "Late night comfort",
    iconName: 'Moon',
    category: 'Late Night',
  },
  {
    id: '4',
    question: "Bored & Chill?",
    subtitle: "Friendly chats",
    iconName: 'Sparkles',
    category: 'Chill',
  },
];

export const HISTORY = [
  {
    id: '1',
    type: 'call',
    name: 'Aisha K.',
    duration: '12:45 mins',
    date: 'Yesterday',
    image: LISTENERS[0].image,
    isOnline: true,
    actionText: 'Call Again',
  },
  {
    id: '2',
    type: 'message',
    name: 'David L.',
    message: 'Hey, how are you fe...',
    date: 'Yesterday',
    image: LISTENERS[1].image,
    isOnline: false,
    actionText: 'Reply',
  },
  {
    id: '3',
    type: 'call',
    name: 'Sarah M.',
    duration: 'Missed',
    date: '2h ago',
    image: LISTENERS[2].image,
    isOnline: false,
    isMissed: true,
    actionText: 'Call Back',
  },
  {
    id: '4',
    type: 'message',
    name: 'James W.',
    message: 'That meditation tec...',
    date: 'Yesterday',
    image: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=256&h=256&q=80',
    isOnline: false,
    actionText: 'Reply',
  },
];

export const TRANSACTIONS = [
  { id: '1', title: 'Top-up successful', type: 'credit', amount: 500, date: '2 hours ago' },
  { id: '2', title: 'Coins spent on call', type: 'debit', amount: -150, date: 'Yesterday' },
  { id: '3', title: 'Coins spent on call', type: 'debit', amount: -200, date: 'Mon, 12 Oct' },
];

export const PACKAGES = [
  { id: '1', coins: 500, price: '₹199', isPopular: false },
  { id: '2', coins: 1200, price: '₹399', isPopular: true },
  { id: '3', coins: 2500, price: '₹699', isPopular: false },
];

async function seed() {
  console.log('Connecting to MongoDB...', process.env.MONGODB_URI);
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('Connected!');

  console.log('Clearing existing data...');
  await User.deleteMany({});
  await AppConfig.deleteMany({});

  console.log('Seeding Users (Listeners)...');
  const allListeners = [...LISTENERS, ...ACTIVE_LISTENERS];
  const userDocs = allListeners.map(l => ({
    phoneNumber: `seed_${l.id}`,
    username: `user_${l.id}`,
    profile: {
      displayName: l.name,
      avatarUrl: l.image,
      bio: 'Professional listener.',
      vibeTags: l.tags,
      location: { city: l.location, country: 'Unknown' },
    },
    settings: {
      isListener: true,
      isAvailable: true,
      callRate: l.rateCoins,
      videoEnabled: l.videoAvailable,
    },
    metrics: { rating: l.rating },
    status: 'active',
  }));
  await User.insertMany(userDocs);

  console.log('Seeding App Config...');
  await AppConfig.insertMany([
    { key: 'MOODS', data: MOODS },
    { key: 'VIBE_CARDS', data: VIBE_CARDS },
    { key: 'VIBE_GRID_QUESTIONS', data: VIBE_GRID_QUESTIONS },
    { key: 'HISTORY', data: HISTORY },
    { key: 'TRANSACTIONS', data: TRANSACTIONS },
    { key: 'PACKAGES', data: PACKAGES },
  ]);

  console.log('Seeding complete!');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
