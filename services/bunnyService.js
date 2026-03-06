const axios = require('axios');

const BUNNY_API = 'https://video.bunnycdn.com/library';

class BunnyService {
  constructor() {
    this.apiKey = process.env.BUNNY_API_KEY;
    this.libraryId = process.env.BUNNY_LIBRARY_ID;
    this.cdnHost = process.env.BUNNY_CDN_HOSTNAME;
  }

  async createVideo(title) {
    const res = await axios.post(
      `${BUNNY_API}/${this.libraryId}/videos`,
      { title },
      { headers: { AccessKey: this.apiKey } }
    );
    return res.data;
  }

  async uploadVideo(videoId, fileBuffer) {
    await axios.put(
      `${BUNNY_API}/${this.libraryId}/videos/${videoId}`,
      fileBuffer,
      {
        headers: {
          AccessKey: this.apiKey,
          'Content-Type': 'application/octet-stream'
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );
  }

  getEmbedUrl(videoId) {
    return `https://iframe.mediadelivery.net/embed/${this.libraryId}/${videoId}`;
  }

  getDirectUrl(videoId) {
    return `https://${this.cdnHost}/${videoId}/play_720p.mp4`;
  }
}

module.exports = new BunnyService();
