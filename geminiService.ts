
import { GoogleGenAI, Type } from "@google/genai";
import { AIResponse, UserInputs, DesignProposal } from "./types";

const PROPOSAL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    style_package: { type: Type.STRING, enum: ['Modern Minimal', 'Warm Nordic', 'Clean Functional'] },
    carcass: {
      type: Type.OBJECT,
      properties: {
        material: { type: Type.STRING },
        color: { type: Type.STRING, enum: ['white', 'black'] }
      },
      required: ['material', 'color']
    },
    fronts: {
      type: Type.OBJECT,
      properties: {
        material: { type: Type.STRING, enum: ['painted_mdf', 'oak_veneer', 'ash_veneer'] },
        finish: { type: Type.STRING },
        color: { type: Type.STRING }
      },
      required: ['material', 'finish', 'color']
    },
    handle_solution: { type: Type.STRING, enum: ['push_to_open', 'integrated_grip'] },
    lighting: {
      type: Type.OBJECT,
      properties: {
        included: { type: Type.BOOLEAN },
        type: { type: Type.STRING, enum: ['integrated_led', 'none'] }
      },
      required: ['included', 'type']
    },
    dimensions_mm: {
      type: Type.OBJECT,
      properties: {
        width: { type: Type.STRING },
        height: { type: Type.STRING },
        depth: { type: Type.STRING }
      },
      required: ['width', 'height', 'depth']
    },
    internal_layout: { type: Type.ARRAY, items: { type: Type.STRING } },
    visual_notes: { type: Type.STRING },
    production_notes: { type: Type.STRING }
  },
  required: ['id', 'style_package', 'carcass', 'fronts', 'handle_solution', 'lighting', 'dimensions_mm', 'internal_layout', 'visual_notes', 'production_notes']
};

const parseImageData = (dataUrl: string) => {
  const parts = dataUrl.split(',');
  if (parts.length < 2) throw new Error("Ugyldig bildeformat");
  const mimeType = parts[0].split(':')[1].split(';')[0];
  const base64Data = parts[1];
  return { mimeType, base64Data };
};

// Generate furniture proposals using gemini-3-pro-preview for complex reasoning
export const generateFurnitureProposals = async (inputs: UserInputs): Promise<AIResponse> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const systemInstruction = `
    Du er Snekker AIndersen, en ekspert på norske hjem og plassbygde møbler.
    Du analyserer rommet og foreslår teknisk gjennomførbare løsninger.
    Svaret skal være på norsk og returneres som ren JSON.
  `;

  const prompt = `Lag 6 varianter av en ${inputs.productType || 'Møbel'}.
    Mål: Bredde:${inputs.width}mm, Høyde:${inputs.height}mm, Dybde:${inputs.depth}mm.
    Beskrivelse: "${inputs.description}"
    Romforhold: "${inputs.constraints_text}"`;

  const imagePart = inputs.image ? {
    inlineData: {
      data: parseImageData(inputs.image).base64Data,
      mimeType: parseImageData(inputs.image).mimeType,
    }
  } : null;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: imagePart ? { parts: [imagePart, { text: prompt }] } : { parts: [{ text: prompt }] },
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          room_analysis: {
            type: Type.OBJECT,
            properties: {
              room_type: { type: Type.STRING },
              style_impression: { type: Type.STRING },
              floor_tone: { type: Type.STRING, enum: ['warm', 'neutral', 'cold'] },
              wall_tone: { type: Type.STRING, enum: ['light', 'medium', 'dark'] },
              constraints: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ['room_type', 'style_impression', 'floor_tone', 'wall_tone', 'constraints']
          },
          design_proposals: { type: Type.ARRAY, items: PROPOSAL_SCHEMA }
        },
        required: ['room_analysis', 'design_proposals']
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("Ingen svar fra AI");
  return JSON.parse(text);
};

// Visualize design proposals using gemini-2.5-flash-image
export const visualizeProposal = async (baseImage: string, proposal: DesignProposal, inputs: UserInputs, refinementComment?: string): Promise<string | undefined> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const xPos = inputs.placement_point?.x || 50;
  const yPos = inputs.placement_point?.y || 50;
  const { mimeType, base64Data } = parseImageData(baseImage);
  
  const internalDetails = proposal.internal_layout.join(', ');

  const prompt = `
    OPPGAVE: Tegn møbelet ${inputs.productType || 'Møbelet'} inn i bildet med fotorealisme.
    Plassering sentrert rundt x=${xPos.toFixed(1)}%, y=${yPos.toFixed(1)}%.
    Stil: ${proposal.style_package}. Materiale: ${proposal.fronts.material}.
    Detaljer: ${internalDetails}. Grep: ${proposal.handle_solution}.
    ${refinementComment ? `Viktig endring: ${refinementComment}` : ''}
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        },
        { text: prompt },
      ],
    },
  });

  const candidate = response.candidates?.[0];
  if (!candidate?.content?.parts) return undefined;

  for (const part of candidate.content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return undefined;
};

// Refine a specific design proposal using gemini-3-pro-preview
export const refineSpecificProposal = async (original: DesignProposal, comment: string, _inputs: UserInputs): Promise<DesignProposal> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const { visual_image, ...currentProposalData } = original;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [{
        text: `Oppdater dette møbelet basert på: "${comment}". Nåværende data: ${JSON.stringify(currentProposalData)}`
      }]
    },
    config: {
      systemInstruction: "Du er Snekker AIndersen. Returner kun oppdatert JSON-data i riktig format.",
      responseMimeType: "application/json",
      responseSchema: PROPOSAL_SCHEMA
    }
  });

  const text = response.text;
  if (!text) throw new Error("Kunne ikke oppdatere forslaget.");
  return JSON.parse(text);
};
