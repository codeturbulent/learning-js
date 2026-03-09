function getdata() {
  var data = "";

  // Function to log data into the `data` variable with a separator
  function logWithSeparator(separator, ...values) {
    data += values.join(separator) + "\n";
  }

  var cont = document.getElementsByClassName("y7PRA");

  for (let i = 0; i < cont.length; i++) {
    // Fetch elements safely, checking if they exist
    var storenames = cont[i].getElementsByClassName("qBF1Pd")[0];
    var type = cont[i]
      .getElementsByClassName("UaQhfb")[0]
      ?.querySelector(
        ".UaQhfb.fontBodyMedium > div:nth-child(4) > div > span:nth-child(1) > span"
      );
    var place = cont[i]
      .getElementsByClassName("UaQhfb")[0]
      ?.querySelector(
        ".UaQhfb.fontBodyMedium > div:nth-child(4) > div > span:last-child > span:nth-child(2)"
      );
    var phoneno = cont[i].getElementsByClassName("UsdlK")[0];

    // Check if phoneno exists and starts with '01' (landline condition)
    let isLandline = phoneno && phoneno.innerText.startsWith("01");

    // Initialize log object
    let logData = {
      storenames: storenames?.innerHTML || "N/A",
      type: type?.innerHTML || "N/A",
      place: place?.innerHTML || "N/A",
      phoneno: "N/A",
      landline: "N/A",
    };

    // Check for landline and set the fields appropriately
    if (isLandline) {
      logData.landline = phoneno.innerHTML;
      logData.phoneno = "N/A";
    }
    // If it's a regular phone number
    else if (phoneno) {
      logData.phoneno = phoneno.innerHTML;
    }

    // Log the data if any of the relevant fields are found
    if (storenames || type || place || phoneno) {
      // Log data to `data` variable using separator `||`
      logWithSeparator(
        "||",
        logData.storenames,
        logData.type,
        logData.place,
        logData.phoneno,
        logData.landline
      );
    } else {
      logWithSeparator("||", "No data found", "N/A", "N/A", "N/A", "N/A");
    }
  }

  // At the end, you can access `data` to see all the stored entries.
  console.log(data);
}
