
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Configuração R2 (Cloudflare) ou AWS S3
const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});

const uploadFile = async (fileBuffer, fileName, mimeType) => {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `videos/${Date.now()}-${fileName}`,
    Body: fileBuffer,
    ContentType: mimeType,
    ACL: 'public-read',
  });

  try {
    await s3.send(command);
    return `${process.env.CDN_URL}/videos/${command.input.Key}`;
  } catch (err) {
    console.error("Erro no Storage S3:", err);
    throw new Error("Falha no upload para o storage externo.");
  }
};

module.exports = { uploadFile };
