import { db } from "@/lib/firebase";
import { collection, doc, setDoc, getDoc } from "firebase/firestore";
import { auth } from "@/lib/firebase";

/**
 * Saves user info to Firestore if it doesn't exist.
 */
export async function saveUserToFirestore() {
  if (!auth.currentUser) return;

  const userRef = doc(collection(db, "users"), auth.currentUser.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    await setDoc(userRef, {
      uid: auth.currentUser.uid,
      email: auth.currentUser.email,
      role: "Prosumer", // Default role, can be changed later
      totalEnergySold: 0,
      totalEnergyPurchased: 0,
      balance: 0,
      createdAt: new Date(),
    });
    console.log("New user added to Firestore!");
  }
}
