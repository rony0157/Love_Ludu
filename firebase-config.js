/* ============================================================
   এখানে তোমার নিজের Firebase project এর config বসাও।
   কোথায় পাবে:
   Firebase Console → তোমার প্রজেক্ট → ⚙️ Project settings
   → "Your apps" → Web app (</>)  → SDK setup and configuration

   Realtime Database অবশ্যই enable করে নিতে হবে:
   Firebase Console → Build → Realtime Database → Create Database
   ============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyAnAWbp_gnkxpxQjfndEzRYquLqPc2AIrQ",
  authDomain: "love-ludu.firebaseapp.com",
  databaseURL: "https://love-ludu-default-rtdb.firebaseio.com",
  projectId: "love-ludu",
  storageBucket: "love-ludu.firebasestorage.app",
  messagingSenderId: "157555187361",
  appId: "1:157555187361:web:71b905dbc5926bd6cb5ae0"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
