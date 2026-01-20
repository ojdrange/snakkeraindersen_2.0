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
  // Prøv både process.env.API_KEY og VITE_ prefix som ofte brukes i build-miljøer
  const apiKey = process.env.API_KEY || (import.meta as any).env?.VITE_API_KEY;
  
  if (!apiKey || apiKey === "undefined" || apiKey === "") {
    console.error("KRITISK FEIL: Ingen API-nøkkel funnet. Sjekk Vercel Environment Variables.");
    throw new Error("API-nøkkel mangler. Vennligst sjekk konfigurasjonen.");
  }
  return new GoogleGenAI({ apiKey });
};

export const generateFurnitureProposals = async (inputs: UserInputs): Promise<AIResponse> => {
  const ai = getAIClient();

  const systemInstruction = `
    Du er Snekker AIndersen, en ekspert på norske hjem og plassbygde møbler.
    Du analyserer rommet og foreslår teknisk gjennomførbare løsninger.
    Svaret skal være på norsk og returneres som ren JSON.
  `;

  const prompt = `Lag 6 varianter av en ${inputs.productType}.
    Mål: B:${inputs.width}mm, H:${inputs.height}mm, D:${inputs.depth}mm.
    Beskrivelse: "${inputs.description}"
    Romforhold: "${inputs.constraints_text}"`;

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

    return JSON.parse(response.text);
  } catch (err: any) {
    console.error("Feil ved generering av forslag:", err);
    throw new Error(`Forslagsfeil: ${err.message}`);
  }
};

export const visualizeProposal = async (baseImage: string, proposal: DesignProposal, inputs: UserInputs, refinementComment?: string): Promise<string | undefined> => {
  try {
    const ai = getAIClient();
    const xPos = inputs.placement_point?.x || 50;
    const yPos = inputs.placement_point?.y || 50;
    
    const internalDetails = proposal.internal_layout.join(', ');

    const prompt = `
      OPPGAVE: Tegn møbelet ${inputs.productType} inn i bildet med fotorealisme.
      
      PLASSERING OG RYDDING: 
      - Møbelet skal sentreres rundt x=${xPos.toFixed(1)}%, y=${yPos.toFixed(1)}%.
      - VIKTIG: Alt av eksisterende møbler, rot eller gjenstander i dette området skal FJERNES HELT (inpainting). Det nye møbelet skal stå direkte mot veggen/gulvet der det gamle stod.
      
      ARKITEKTONISK INTEGRASJON:
      - Respekter dører og dørkarmer. Møbelet skal ALDRI dekke over en døråpning eller dørlist som er i bruk.
      - Hvis møbelet er bredere enn plassen mellom en dør og en vegg, skal det tilpasses nøyaktig til karmen uten å overlappe.
      - Pass på at møbelet følger rommets perspektiv og dybde.
      
      UTFØRELSE:
      - Stil: ${proposal.style_package}.
      - Materiale: ${proposal.fronts.material.replace('_', ' ')} i fargen "${proposal.fronts.color}".
      - Detaljer: ${internalDetails}. Grep: ${proposal.handle_solution.replace(/_/g, ' ')}.
      ${refinementComment ? `- BRUKERENS SPESIFIKKE ENDRING: "${refinementComment}".` : ''}
      
      KVALITET: 8k oppløsning, perfekt lyssetting og skygger som matcher rommet.
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
    throw new Error("Modellen returnerte ingen bildedata.");
  } catch (err: any) {
    console.error("Visualiseringsfeil i Gemini Service:", err);
    throw err;
  }
};

export const refineSpecificProposal = async (original: DesignProposal, comment: string, _inputs: UserInputs): Promise<DesignProposal> => {
  const ai = getAIClient();
  const { visual_image, ...currentProposalData } = original;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Oppdater dette møbelet basert på: "${comment}". Data: ${JSON.stringify(currentProposalData)}`,
    config: {
      systemInstruction: "Du er Snekker AIndersen. Returner kun oppdatert JSON-data i riktig format.",
      responseMimeType: "application/json",
      responseSchema: PROPOSAL_SCHEMA
    }
  });

  return JSON.parse(response.text);
};