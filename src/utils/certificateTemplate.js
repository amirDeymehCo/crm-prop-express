// utils/certificateTemplate.js
const path = require("path");
const fs = require("fs");

module.exports.getCertificateHTML = ({
  fullName,
  total_profit,
  formattedDate,
  qrData,
}) => {
  const imagePath = path.resolve(
    __dirname,
    "../../public/certificate-withdrawal.jpg",
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
      top: 300px;
      width: 100%;
      text-align: center;
      font-size: 42px;
      font-weight: 500;
    }

    .profit {
      position: absolute;
      top: 515px;
      text-align: center;
      font-size: 18px;
      left: 50%;
      transform: translateX(48%);
    }

    .date {
      position: absolute;
      bottom: 25px;
      left: 320px;
      font-size: 19px;
    }

    .qr {
      position: absolute;
      bottom: 100px;
      left: 360px;
    }

  </style>
</head>

<body>
  <div class="certificate">
    <div class="name">${fullName}</div>

    <div class="profit">
   <b>${total_profit}</b>
    </div>

    <div class="qr">
      <img src="${qrData}" width="90" />
    </div>

    <div class="date">
      <b>${formattedDate}</b>
    </div>

  </div>
</body>
</html>
`;
};
