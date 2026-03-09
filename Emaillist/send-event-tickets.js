// Import the admin SDK
var admin = require("firebase-admin");

const nodemailer = require("nodemailer");
// NEW: Import the getFirestore function
const { getFirestore } = require("firebase-admin/firestore");
// Your service account key
var serviceAccount = require("./fresshers-firebase-adminsdk-fbsvc-fa163dc655.json");
// Initialize the app
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
// NEW: Get the Firestore database instance
const db = getFirestore();
const users = db.collection("submissions");
var docs = [];

async function getdata(params) {
  const doc = await users.get();
  if (doc.empty) {
    console.log("No documents found in 'submissions'.");
  } else {
    console.log("Found documents:");
    doc.forEach((docc) => {
      docs.push(docc);
    });
    start();
    // modifydoc("ADtsRFXURnf0eFtEp60N", {
    //   name: "Md Sajid Khursheed",
    //   email: "sajidk0612@gmail.com",
    //   branch: "CE",
    //   joined_event: "false",
    //   mobile: "9661389959",
    //   emailsent: "false",
    // });
  }
}

async function checkTransactionStatus(orderId) {
  try {
    // This is the GET request from your script
    const response = await fetch(
      "https://freshers-8fly.vercel.app/api/callback?merchantOrderId=" +
        orderId +
        "-JUNIORS"
    );

    if (!response.ok) {
      // Handle HTTP errors (like 404, 500)
      console.error(
        `HTTP error for ${orderId}: ${response.status} ${response.statusText}`
      );
      return {
        success: false,
        status: "HTTP_ERROR",
        message: response.statusText,
      };
    }

    const data = await response.json();
    // Return the server's JSON response
    // (e.g., { success: true, status: "SUCCESS" } or { success: true, status: "PENDING" })
    return data;
  } catch (error) {
    console.error(`Fetch error for ${orderId}:`, error.message);
    // Return a consistent error object
    return { success: false, status: "EXCEPTION", message: error.message };
  }
}

// --- 3. The Main Loop to Verify All IDs ---

/**
 * Main function to iterate through all IDs and check their status one by one.
 */
async function verifyAllTransactions() {
  console.log(
    `Starting verification for ${transactionIds.length} transactions...`
  );

  // We'll store all results in this object
  const allResults = {};

  // This is the "for loop" you requested.
  // We use a "for...of" loop so we can use "await" inside,
  // which makes the checks happen one after another (sequentially).
  for (const id of transactionIds) {
    console.log(`Checking status for: ${id}`);

    // Wait for the check to complete before starting the next one
    const result = await checkTransactionStatus(id);

    // Log the individual result and store it
    console.log(`  -> Result:`, result);
    allResults[id] = result;
  }

  console.log("--- All Verifications Complete ---");
  console.log("Final Results:", allResults);

  // You can now see all results in one place.
  // For example, filter for all failed transactions:
  const failedTxns = Object.keys(allResults).filter(
    (id) => allResults[id].status === "FAILED"
  );
  console.log("Failed Transactions:", failedTxns);

  return allResults;
}

// --- 4. Run the Verification ---

// Call the main function to start the process
// verifyAllTransactions();
getdata();

// Create a test account or replace with real credentials.
const transporter = nodemailer.createTransport({
  service: "gmail", // true for 465, false for other ports
  auth: {
    user: "codeturbulent@gmail.com",
    pass: "btspvtmokgdszgidbzs",
  },
});
// Wrap in an async IIFE so we can use await.
async function sendmail(user) {
  const info = await transporter.sendMail({
    from: '"Imperial Feast Ticket"',
    to: `${user.email}`,

    subject: `${user.name} !! Your Ticket for Imperial Fiesta 2025 Inside.`,
    // text: "Hello world?", // plain‑text body
    html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Imperial Fiesta Ticket</title>
    <style>
        /* Resets */
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; }
        
        /* Client-specific resets */
        body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; background-color: #1a1a2e; }
        
        /* General Styling */
        .font-poppins { font-family: 'Poppins', 'Segoe UI', Helvetica, Arial, sans-serif; }
        .font-cinzel { font-family: 'Georgia', 'Times New Roman', serif; }
        
        /* Responsive */
        @media screen and (max-width: 600px) {
            .w-full { width: 100% !important; }
            .p-mobile { padding: 20px !important; }
            .h-auto { height: auto !important; }
        }
    </style>
    <!-- Import Fonts (Works in Apple Mail, iOS, some Android. Fallback to serif/sans-serif on others) -->
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&family=Cinzel:wght@700&display=swap" rel="stylesheet">
</head>
<body style="background-color: #1a1a2e; margin: 0; padding: 0;">

    <!-- Preview Text (Hidden) -->
    <div style="display: none; font-size: 1px; color: #1a1a2e; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
        Your exclusive pass to Imperial Fiesta 2025 is here. Open to view your ticket!
    </div>

    <!-- Main Container -->
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td align="center" style="padding: 40px 10px;">
                
                <!-- Wrapper Table -->
                <table border="0" cellpadding="0" cellspacing="0" width="600" class="w-full" style="max-width: 600px;">
                    
                    <!-- Header -->
                    <tr>
                        <td align="center" style="padding-bottom: 30px;">
                            <h1 class="font-cinzel" style="margin: 0; color: #facc15; font-size: 32px; letter-spacing: 1px; text-shadow: 0 2px 10px rgba(250, 204, 21, 0.3);">
                                ✨ Imperial Fiesta ✨
                            </h1>
                            <p class="font-poppins" style="margin: 5px 0 0 0; color: #9ca3af; font-size: 14px; letter-spacing: 1px; text-transform: uppercase;">
                                Juniors Registration - 2025
                            </p>
                        </td>
                    </tr>

                    <!-- Content Card -->
                    <tr>
                        <td bgcolor="#232342" style="padding: 40px; border-radius: 16px; border: 2px solid #facc15; box-shadow: 0 10px 30px rgba(0,0,0,0.3);" class="p-mobile">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                
                                <!-- Greeting -->
                                <tr>
                                    <td align="center" style="padding-bottom: 20px;">
                                        <h2 class="font-poppins" style="margin: 0; color: #e5e7eb; font-size: 24px; font-weight: 600;">
                                            You're on the list, <span style="color: #facc15;">${user.name}</span>!
                                        </h2>
                                    </td>
                                </tr>

                                <!-- Message Body -->
                                <tr>
                                    <td align="center" style="padding-bottom: 30px;">
                                        <p class="font-poppins" style="margin: 0; color: #d1d5db; font-size: 16px; line-height: 1.6;">
                                            We are thrilled to have you join us. The preparations are underway, and an unforgettable day awaits.
                                            <br><br>
                                            Your unique QR code ticket has been generated. Please click the button below to view and save your pass. You will need to show this at the entrance.
                                        </p>
                                    </td>
                                </tr>

                                <!-- CTA Button -->
                                <tr>
                                    <td align="center" style="padding-bottom: 30px;">
                                        <table border="0" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td align="center" bgcolor="#facc15" style="border-radius: 8px; background: linear-gradient(to right, #facc15, #eab308);">
                                                    
                                                    <a href="https://freshers-feast.rf.gd/ticket.html?uid=${user.txnId}" target="_blank" class="font-poppins" style="font-size: 16px; font-weight: bold; color: #1e1b4b; text-decoration: none; padding: 15px 35px; display: inline-block; border: 1px solid #eab308; border-radius: 8px;">
                                                        ACCESS MY TICKET
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>

                                <!-- Important Message Box -->
                                <tr>
                                    <td align="center" style="padding-bottom: 30px;">
                                         <table border="0" cellspacing="0" cellpadding="0" width="100%">
                                            <tr>
                                                <td bgcolor="rgba(250, 204, 21, 0.05)" style="border: 1px dashed #facc15; border-radius: 8px; padding: 15px;">
                                                    <p class="font-poppins" style="margin: 0; color: #e5e7eb; font-size: 14px; text-align: center; line-height: 1.5;">
                                                        <strong style="color: #facc15; font-size: 15px;"> IMPORTANT INFO</strong><br>
                                                        <span style="display: block; margin-top: 8px;">
                                                        <strong>Dress Code:</strong> Boys (Formal), Girls (Indian/Western)<br>
                                                             Please carry a valid University ID card.
                                                        </span>
                                                    </p>
                                                </td>
                                            </tr>
                                         </table>
                                    </td>
                                </tr>

                                <!-- Divider -->
                                <tr>
                                    <td align="center" style="padding-bottom: 30px;">
                                        <div style="height: 1px; width: 100%; background-color: #3e3e5e; max-width: 200px;"></div>
                                    </td>
                                </tr>

                                <!-- Event Details Small -->
                                <tr>
                                    <td align="center">
                                        <p class="font-poppins" style="margin: 0; color: #9ca3af; font-size: 14px; line-height: 1.8;">
                                           <strong style="color: #facc15;">Date:</strong> November 23, 2025<br>
                                         <strong style="color: #facc15;">Time:</strong> 10:30 AM - 05:00 PM<br>
                                             <strong style="color: #facc15;">Venue:</strong> B.S. Celebration Banquets, Bijnor Road
                                        </p>
                                    </td>
                                </tr>

                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td align="center" style="padding-top: 30px;">
                            <p class="font-poppins" style="margin: 0 0 10px 0; color: #6b7280; font-size: 12px;">
                                Need help? Contact: <strong>Ashish</strong> (8470924109) or <strong>Himanshu</strong> (8005001105)
                            </p>
                            <p class="font-poppins" style="margin: 0; color: #6b7280; font-size: 12px;">
                                &copy; 2025 Imperial Fiesta. BBAU Lucknow.
                            </p>
                        </td>
                    </tr>

                </table>

            </td>
        </tr>
    </table>

</body>
</html>`, // HTML body
  });

  console.log("Message sent:", info.messageId);
}
async function modifydoc(id, data) {
  try {
    const userRef = users.doc(id);
    await userRef.update(data);
    console.log("Document successfully updated!" + id + data);
  } catch (e) {
    console.error("Error updating document:", e);
  }
}
// modifydoc("Wn4b6n5Kqzs8yr2FL0VO",{      name: "Shreya Singh",
//       email: "shreyasingh9267@gmail.com",
//       branch: "CE",
//       mobile: "9473827107", emailsent:"false",})

async function start(params) {
  console.log("started sending");
  for (let i = 0; i < docs.length; i++) {
    const element = docs[i].data();
    // const userRef = users.doc(docs[i].id);
    // await userRef.update({
    //   joined_event: "false",
    //   emailsent: "false",
    // });

    if (element.paymentStatus == "SUCCESS" && element.emailsent != "true") {
      console.log("Emailsent");
      await sendmail(element);
      try {
        const userRef = users.doc(docs[i].id);
        await userRef.update({
          emailsent: "true",
        });
        console.log("Document successfully updated!" + docs[i].id);
      } catch (e) {
        console.error("Error updating document:", e);
      }
    } else {
      // var res = await checkTransactionStatus(element.txnId);
      // console.log(res);
    }
  }
}
// {
//   name: 'Aniket kumar',
//   email: 'ak18051331@gmail.com',
//   branch: 'CE',
//   mobile: '9838844396',
//   hobbies: [],
//   game: '',
//   participate: 'No',
//   txnId: 'TXN1740IFF1762755293534',
//   submittedAt: '2025-11-10T06:14:53.912Z',
//   paymentResponse: {
//     orderId: 'OMO2511101144567263969230W',
//     state: 'COMPLETED',
//     amount: 25000,
//     payableAmount: 25000,
//     feeAmount: 0,
//     expireAt: 1762756196726,
//     metaInfo: { udf1: '9838844396', udf2: 'FreshersEvent' },
//     paymentDetails: [ [Object] ]
//   },
//   paymentStatus: 'SUCCESS'
// }
