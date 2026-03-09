const ftp = require("basic-ftp");
const path = require("path");

async function uploadTestFile() {
  const client = new ftp.Client();
  client.ftp.verbose = true;

  const localFile = path.join(__dirname, "testnote.txt");
  const remoteFile = "testnote.txt"; // Change name if needed

  try {
    await client.access({
      host: "ftpupload.net",
      user: "your_username",
      password: "your_password",
      secure: false
    });

    await client.ensureDir("/htdocs/");
    await client.uploadFrom(localFile, `/htdocs/${remoteFile}`);
    console.log(`✅ Uploaded! Public URL: https://your_domain.42web.io/${remoteFile}`);
  } catch (err) {
    console.error("❌ FTP Upload Failed:", err.message);
  }

  client.close();
}

uploadTestFile();
