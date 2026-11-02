
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  GoogleAuthProvider,
  signInWithPopup,
  linkWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

const app = getApp("commerzo-student");
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

let currentUser = null;
let ownReview = null;

const accountStatus = $("accountStatus");
const accountActions = $("accountActions");
const reviewForm = $("reviewForm");
const reviewMessage = $("reviewMessage");
const reviewList = $("reviewList");
const reviewSummary = $("reviewSummary");

function showMessage(element, value, error = false) {
  if (!element) return;

  element.textContent = value;
  element.classList.toggle("error-text", error);
}

function isGoogleUser(user) {
  return !!user &&
    user.providerData.some(p => p.providerId === "google.com");
}

function makeButton(label, handler, className = "secondary") {
  const button = document.createElement("button");

  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", handler);

  return button;
}

function authError(error) {
  const messages = {
    "auth/unauthorized-domain":
      "This website domain is not authorized in Firebase.",

    "auth/popup-blocked":
      "Browser blocked the login popup. Allow popups and retry.",

    "auth/popup-closed-by-user":
      "Login was cancelled.",

    "auth/operation-not-allowed":
      "This login method is disabled in Firebase.",

    "auth/network-request-failed":
      "Network error. Check your internet connection."
  };

  return messages[error.code] ||
    error.message ||
    "Authentication failed.";
}

// ACCOUNT UI

function renderAccount(user) {
  currentUser = user;

  accountActions.replaceChildren();

  if (!user) {
    accountStatus.textContent = "Browsing as visitor";

    accountActions.append(
      makeButton("Continue with Google", googleLogin, ""),
      makeButton("Continue as Guest", guestLogin)
    );

    return;
  }

  accountStatus.textContent =
    `${isGoogleUser(user) ? "Google account" : "Guest account"} · ${user.displayName || "Student"}`;

  if (user.isAnonymous) {
    accountActions.append(
      makeButton("Link Google account", linkGoogle, "")
    );
  }

  accountActions.append(
    makeButton("Log out", logout)
  );
}

async function googleLogin() {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error(error);
    showMessage(accountStatus, authError(error), true);
  }
}

async function guestLogin() {
  try {
    await signInAnonymously(auth);
  } catch (error) {
    console.error(error);
    showMessage(accountStatus, authError(error), true);
  }
}

async function linkGoogle() {
  const user = auth.currentUser;

  if (!user?.isAnonymous) return;

  try {
    await linkWithPopup(user, provider);

    showMessage(
      accountStatus,
      "Google account linked successfully."
    );

  } catch (error) {
    console.error(error);

    let extra = "";

    if (error.code === "auth/credential-already-in-use") {
      extra =
        " This Google account is already linked to another account. Automatic merging is not available.";
    }

    showMessage(
      accountStatus,
      authError(error) + extra,
      true
    );
  }
}

async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    showMessage(accountStatus, authError(error), true);
  }
}

// REVIEW FORM

function renderReviewFormState() {
  const allowed = isGoogleUser(currentUser);

  [...reviewForm.elements].forEach(element => {
    element.disabled = !allowed;
  });

  $("reviewAuthHint").textContent = allowed
    ? "Your review will appear publicly after moderation."
    : "Sign in with Google to submit a review. Guest users can study but cannot review.";

  $("reviewSubmit").textContent =
    ownReview ? "Update review" : "Submit review";

  $("reviewDelete").classList.toggle(
    "hidden",
    !ownReview
  );

  if (ownReview) {
    $("reviewRating").value = String(ownReview.rating);
    $("reviewComment").value = ownReview.comment || "";
  }
}

function stars(value) {
  return "★".repeat(value) + "☆".repeat(5 - value);
}

// LOAD PUBLIC REVIEWS

async function loadReviews() {
  reviewList.replaceChildren();

  reviewSummary.textContent =
    "Loading approved reviews...";

  try {
    const reviewsQuery = query(
      collection(db, "reviews"),
      where("status", "==", "approved")
    );

    const snapshot = await getDocs(reviewsQuery);

    const reviews = snapshot.docs.map(doc => doc.data());

    const average = reviews.length
      ? reviews.reduce(
          (total, review) => total + Number(review.rating || 0),
          0
        ) / reviews.length
      : 0;

    reviewSummary.textContent = reviews.length
      ? `${average.toFixed(1)} / 5 · ${reviews.length} approved reviews`
      : "No approved reviews yet.";

    reviews.sort((a, b) =>
      (b.createdAt?.seconds || 0) -
      (a.createdAt?.seconds || 0)
    );

    reviews.forEach(review => {
      const card = document.createElement("article");
      card.className = "review-card";

      const heading = document.createElement("div");
      heading.className = "review-card-head";

      const name = document.createElement("strong");
      name.textContent =
        review.displayName || "COMMERZO Student";

      const rating = document.createElement("span");
      rating.className = "review-stars";
      rating.textContent = stars(Number(review.rating));

      const comment = document.createElement("p");
      comment.textContent = review.comment || "";

      heading.append(name, rating);
      card.append(heading, comment);

      reviewList.append(card);
    });

    if (!reviews.length) {
      const empty = document.createElement("p");
      empty.textContent = "No approved reviews yet.";
      empty.className = "muted";

      reviewList.append(empty);
    }

  } catch (error) {
    console.error("Review loading error:", error);

    reviewSummary.textContent =
      "Reviews are temporarily unavailable.";
  }
}

// LOAD CURRENT USER'S REVIEW

async function loadOwnReview(user) {
  ownReview = null;

  if (isGoogleUser(user)) {
    try {
      const reference = doc(db, "reviews", user.uid);
      const snapshot = await getDoc(reference);

      if (snapshot.exists()) {
        ownReview = snapshot.data();
      }

    } catch (error) {
      console.warn("Could not load own review:", error);
    }
  }

  renderReviewFormState();
}

// SUBMIT OR UPDATE REVIEW

reviewForm.addEventListener("submit", async event => {
  event.preventDefault();

  const user = auth.currentUser;

  if (!isGoogleUser(user)) {
    showMessage(
      reviewMessage,
      "Sign in with Google before submitting a review.",
      true
    );
    return;
  }

  const rating = Number($("reviewRating").value);
  const comment = $("reviewComment").value.trim();

  if (
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5 ||
    comment.length < 3 ||
    comment.length > 1000
  ) {
    showMessage(
      reviewMessage,
      "Choose 1–5 stars and write 3–1000 characters.",
      true
    );
    return;
  }

  const submit = $("reviewSubmit");
  submit.disabled = true;

  try {
    const reference = doc(db, "reviews", user.uid);

    const reviewData = {
      displayName: (user.displayName || "COMMERZO Student").slice(0, 80),
      rating,
      comment,
      status: "pending",
      updatedAt: serverTimestamp()
    };

    if (ownReview) {
      await updateDoc(reference, reviewData);
    } else {
      await setDoc(reference, {
        ...reviewData,
        uid: user.uid,
        createdAt: serverTimestamp()
      });
    }

    ownReview = {
      rating,
      comment,
      status: "pending"
    };

    showMessage(
      reviewMessage,
      "Review submitted for moderation. It will appear after approval."
    );

    renderReviewFormState();

  } catch (error) {
    console.error("Review save error:", error);

    showMessage(
      reviewMessage,
      error.code === "permission-denied"
        ? "Permission denied. Check Firestore rules and Google sign-in."
        : authError(error),
      true
    );

  } finally {
    submit.disabled = false;
  }
});

// DELETE OWN REVIEW

$("reviewDelete").addEventListener("click", async () => {
  const user = auth.currentUser;

  if (!isGoogleUser(user) || !ownReview) return;

  if (!confirm("Delete your review?")) return;

  try {
    await deleteDoc(doc(db, "reviews", user.uid));

    ownReview = null;
    $("reviewComment").value = "";

    showMessage(reviewMessage, "Your review was deleted.");

    renderReviewFormState();

  } catch (error) {
    showMessage(
      reviewMessage,
      authError(error),
      true
    );
  }
});

// AUTH STATE

onAuthStateChanged(auth, async user => {
  renderAccount(user);
  await loadOwnReview(user);
});

loadReviews();

// RESOURCE VIEWER

const viewer = $("resourceViewer");
const viewerFrame = $("resourceFrame");

function closeViewer() {
  viewer.classList.add("hidden");
  viewerFrame.src = "about:blank";
}

$("resourceViewerClose").addEventListener(
  "click",
  closeViewer
);

viewer.addEventListener("click", event => {
  if (event.target === viewer) {
    closeViewer();
  }
});

document.addEventListener("click", event => {
  const link = event.target.closest("#resourceResults a");

  if (!link) return;

  event.preventDefault();

  const url = new URL(link.href);

  if (!["http:", "https:"].includes(url.protocol)) {
    return;
  }

  $("resourceWatermark").textContent =
    `COMMERZO • ${currentUser?.displayName || "Guest"} • ${currentUser?.uid?.slice(0, 8) || "VISITOR"}`;

  viewerFrame.src = url.href;

  viewer.classList.remove("hidden");
});

document.addEventListener("keydown", event => {
  if (
    !viewer.classList.contains("hidden") &&
    event.key === "Escape"
  ) {
    closeViewer();
  }
});
