// utils/certificateTemplate.js
const path = require("path");
const fs = require("fs");

module.exports.getCertificateHTMLPhase = ({
  fullName,
  qrData,
  formattedDate,
  phase,
}) => {
  const imagePath = path.join(
    process.cwd(),
    "public",
    phase === 1 ? "certificate_phase_1.jpg" : "certificate_phase_2.jpg",
  );

  const imageBase64 = fs.readFileSync(imagePath, "base64");

  const bgImage = `data:image/jpeg;base64,${imageBase64}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body {
      margin: 0;
    }
    .certificate {
      width: 1123px;
      height: 794px;
      background-image: url("${bgImage}");
      background-size: cover;
      background-position: center;
      position: relative;
      font-family: Arial, sans-serif;
      color: white;
    }

    .name {
      position: absolute;
      top: 365px;
      width: 100%;
      text-align: center;
      font-size: 42px;
      font-weight: 500;
      color: #1c1c1c;
    }
    .date {
      position: absolute;
      bottom: 95px;
      text-align: center;
      font-size: 18px;
      font-weight: 500;
      color: #1c1c1c;
      left: 350px;
    }

    .qr {
      position: absolute;
      bottom: 30px;
      left: 75px;
    }

  </style>
</head>

<body>
  <div class="certificate">
    <div class="name">${fullName}</div>
    <div class="date">${formattedDate}</div>

    <div class="qr">
      <img src="${qrData}" width="130" />
    </div>


  </div>
</body>
</html>
`;
};
