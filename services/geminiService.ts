
import { GoogleGenAI } from "@google/genai";

export const getAIRecommendation = async (userPreferences: string) => {
  // Fix: Create a new GoogleGenAI instance right before making an API call to ensure it always uses the most up-to-date API key from the execution context.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `O usuário gosta de: ${userPreferences}. Sugira que tipo de conteúdo vertical ele deve assistir a seguir no Lorflux. Responda em Português Brasileiro. Seja curto e impactante.`,
      config: {
        temperature: 0.7,
        topP: 0.95,
      }
    });
    return response.text;
  } catch (error) {
    console.error("Erro Gemini:", error);
    return "Algo único está esperando por você no feed!";
  }
};

export const getEpisodeSummary = async (title: string, description: string) => {
  // Fix: Create a new GoogleGenAI instance right before making an API call to ensure it always uses the most up-to-date API key from the execution context.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `O seguinte é um episódio de uma série de vídeos curtos. Título: ${title}. Descrição: ${description}. Forneça uma frase de impacto em Português Brasileiro para conseguir mais visualizações.`,
    });
    return response.text;
  } catch (error) {
    return description;
  }
};
