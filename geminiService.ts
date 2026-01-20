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

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "undefined") {
    throw new Error("API_KEY mangler i kjøremiljøet. Sjekk Vercel Settings > Environment Variables.");
  }
  return new GoogleGenAI({ apiKey });
};

export const generateFurnitureProposals = async (inputs: UserInputs): Promise<AIResponse> => {
  const ai = getAIClient();

  const systemInstruction = `
    Du er Snekker AIndersen, en erfaren norsk møbelkonstruktør.
    Ditt fokus er KONSTRUKSJON og FUNKSJONALITET.
    Analysér brukerens beskrivelse for tekniske komponenter.
    Du skal generere nøyaktig 6 unike varianter som tolker brukerens tekst på ulike måter.
    Bruk norsk språk i alle tekster.
  `;

  const prompt = `Konstruer 6 unike varianter av en ${inputs.productType}.
    DIMENSJONER: B:${inputs.width}mm, H:${inputs.height}mm, D:${inputs.depth}mm.
    BRUKERØNSKER: "${inputs.description}"`;

  const imagePart = inputs.image ? {
    inlineData: {
      data: inputs.image.split(',')[1],
      mimeType: 'image/jpeg',
    }
  } : null;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: imagePart ? { parts: [imagePart, { text: prompt }] } : prompt,
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
    if (!text) throw new Error("Tomt svar fra AI-snekkeren.");
    return JSON.parse(text);
  } catch (err: any) {
    throw new Error(`Feil ved generering: ${err.message}`);
  }
};

export const visualizeProposal = async (baseImage: string, proposal: DesignProposal, inputs: UserInputs, refinementComment?: string): Promise<string | undefined> => {
  try {
    const ai = getAIClient();
    const xPos = inputs.placement_point?.x || 50;
    const yPos = inputs.placement_point?.y || 50;
    
    const prompt = `
      OPPGAVE: Visualiser en fotorealistisk ${inputs.productType} integrert perfekt i rommet på bildet.
      PLASSERING: x=${xPos.toFixed(1)}%, y=${yPos.toFixed(1)}%.
      STIL: ${proposal.style_package}.
      DETALJER: Fronter i ${proposal.fronts.material} med fargen ${proposal.fronts.color}.
      ${refinementComment ? `ENDRINGSØNSKE: "${refinementComment}".` : ''}
      KVALITET: Fotorealistisk 3D-visualisering med realistiske skygger. Returner kun det ferdige bildet.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: baseImage.split(',')[1],
              mimeType: 'image/jpeg',
            },
          },
          { text: prompt },
        ],
      },
    });

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData?.data) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
  } catch (err) {
    console.error("Visualiseringsfeil:", err);
  }
  return undefined;
};

export const refineSpecificProposal = async (original: DesignProposal, comment: string, _inputs: UserInputs): Promise<DesignProposal> => {
  const ai = getAIClient();
  const { visual_image, ...currentProposalData } = original;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Oppdater denne JSON-konstruksjonen basert på ønske: "${comment}". Nåværende data: ${JSON.stringify(currentProposalData)}`,
    config: {
      systemInstruction: "Du er Snekker AIndersen. Returner oppdatert møbel-JSON.",
      responseMimeType: "application/json",
      responseSchema: PROPOSAL_SCHEMA
    }
  });

  const text = response.text;
  if (!text) throw new Error("Kunne ikke oppdatere forslaget.");
  return JSON.parse(text);
};