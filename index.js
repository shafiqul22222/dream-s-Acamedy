const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();

// ZiniPay পেমেন্ট লিঙ্ক তৈরির জন্য Cloud Function
exports.createPayment = functions.https.onCall(async (data, context) => {
  // ব্যবহারকারী লগইন করা আছে কিনা তা নিশ্চিত করুন
  if (!context.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "পেমেন্ট করার জন্য আপনাকে অবশ্যই লগইন করতে হবে।",
    );
  }

  // অ্যাডমিন প্যানেল থেকে গেটওয়ে সেটিংস আনুন
  const settingsDoc = await admin.firestore().collection("site_settings")
      .doc("payment_gateway").get();

  if (!settingsDoc.exists) {
    throw new functions.https.HttpsError(
        "failed-precondition",
        "পেমেন্ট গেটওয়ে সেটিংস খুঁজে পাওয়া যায়নি।",
    );
  }

  const settings = settingsDoc.data();
  const gateway = data.gateway;
  const tran_id = `${context.auth.uid}-${Date.now()}`;
  const base_url = "https://dreamsedu.publicvm.com"; // আপনার ওয়েবসাইটের সঠিক URL দিন

  let response;

  try {
    switch (gateway) {
      case "zinipay":
        if (!settings.zinipay || !settings.zinipay.merchant_key) {
          throw new Error("ZiniPay মার্চেন্ট কী সেট করা নেই।");
        }
        
        const ziniApiUrl = "https://api.zinipay.com/v1/payment/create";
        const ziniApiKey = settings.zinipay.merchant_key; // অ্যাডমিন প্যানেল থেকে পাওয়া কী

        const ziniPayload = {
          amount: data.amount,
          redirect_url: `${base_url}?payment=success&tran_id=${tran_id}`,
          cancel_url: `${base_url}?payment=cancel`,
          webhook_url: `YOUR_WEBHOOK_URL`, // (ঐচ্ছিক) প্রয়োজন হলে সেট করুন
          metadata: {
            product: data.product_name,
            user_id: context.auth.uid,
          },
        };

        response = await axios.post(ziniApiUrl, ziniPayload, {
          headers: {
            "zini-api-key": ziniApiKey,
            "Content-Type": "application/json",
          },
        });
        
        if (response.data && response.data.status === true) {
            return {payment_url: response.data.payment_url};
        } else {
            throw new Error(response.data.message || "ZiniPay থেকে লিঙ্ক তৈরি করা যায়নি।");
        }

      // এখানে ভবিষ্যতে অন্যান্য গেটওয়ে যোগ করা যাবে (SSLCOMMERZ, aamarPay)
      // ...

      default:
        throw new Error("অপরিচিত বা অসমর্থিত পেমেন্ট গেটওয়ে।");
    }
  } catch (error) {
    console.error("Payment creation error:", error.response ? error.response.data : error.message);
    throw new functions.https.HttpsError(
        "internal",
        "পেমেন্ট লিঙ্ক তৈরি করার সময় একটি ত্রুটি ঘটেছে।",
        error.message,
    );
  }
});
