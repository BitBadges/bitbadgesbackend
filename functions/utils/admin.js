const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();
const firestoreRef = admin.firestore;
module.exports = { admin, db, firestoreRef };
