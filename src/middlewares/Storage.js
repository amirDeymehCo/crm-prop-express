const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
require("dotenv").config();
const path = require("path");

const client = new S3Client({
  region: "default",
  endpoint: process.env.LIARA_ENDPOINT,
  credentials: {
    accessKeyId: process.env.LIARA_ACCESS_KEY,
    secretAccessKey: process.env.LIARA_SECRET_KEY,
  },
});

const params = (body, fileExtension) => ({
  Body: body,
  Bucket: process.env.LIARA_BUCKET_NAME,
  Key:
    new Date()?.toString()?.replaceAll(" ", "-") +
    Math.round(Math.random() * 100) +
    "." +
    fileExtension,
});

// async/await

const handelUploadFile = async (file) => {
  try {
    return file?.filename;
  } catch (error) {
    console.log(error);
    return null;
  }
};

module.exports = handelUploadFile;
