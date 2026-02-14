
export class MediaService {
  /**
   * No frontend, simulamos a validação rigorosa que o backend FFmpeg faria.
   * Em produção real, o arquivo seria enviado para o servidor e processado pelo fluent-ffmpeg.
   */
  static async validateVideo(file: File): Promise<{ valid: boolean; error?: string }> {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';

      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        
        // 1. Resolução Obrigatória 1080x1920 (Vertical)
        if (video.videoWidth !== 1080 || video.videoHeight !== 1920) {
          resolve({ valid: false, error: 'Resolução deve ser exatamente 1080x1920 (9:16).' });
          return;
        }

        // 2. Duração Máxima 10 minutos (600s)
        if (video.duration > 600) {
          resolve({ valid: false, error: 'Duração máxima permitida é de 10 minutos.' });
          return;
        }

        // 3. Simulação de Codec e FPS (Validação real feita no server.js)
        resolve({ valid: true });
      };

      video.onerror = () => resolve({ valid: false, error: 'Arquivo de vídeo inválido ou corrompido.' });
      video.src = URL.createObjectURL(file);
    });
  }

  static async validatePanel(file: File): Promise<{ valid: boolean; error?: string }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        // Limite HI-QUA: 800x1280
        if (img.width > 800 || img.height > 1280) {
          resolve({ valid: false, error: 'Tamanho máximo do painel HI-QUA é 800x1280px.' });
          return;
        }
        resolve({ valid: true });
      };
      img.onerror = () => resolve({ valid: false, error: 'Imagem inválida.' });
      img.src = URL.createObjectURL(file);
    });
  }
}
