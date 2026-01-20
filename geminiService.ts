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
  if (!apiKey || apiKey === "undefined" || apiKey === "") {
    throw new Error("API_KEY mangler i systemet. Vennligst sjekk konfigurasjonen.");
  }
  return new GoogleGenAI({ apiKey });
};

export const generateFurnitureProposals = async (inputs: UserInputs): Promise<AIResponse> => {
  const ai = getAIClient();

  const systemInstruction = `
    Du er Snekker AIndersen, en ledende norsk interiørarkitekt og snekker.
    Din oppgave er å generere 6 unike, teknisk mulige forslag til et møbel.
    Svaret skal være på norsk og returneres som ren JSON.
  `;

  const prompt = `Konstruer 6 varianter av en ${inputs.productType}.
    Mål: Bredde ${inputs.width}mm, Høyde ${inputs.height}mm, Dybde ${inputs.depth}mm.
    Beskrivelse: "${inputs.description}"
    Spesielle hensyn i rommet: "${inputs.constraints_text}"`;

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
    if (!text) throw new Error("AI returnerte ikke data.");
    return JSON.parse(text);
  } catch (err: any) {
    throw new Error(`Klarte ikke å generere forslag: ${err.message}`);
  }
};

export const visualizeProposal = async (baseImage: string, proposal: DesignProposal, inputs: UserInputs, refinementComment?: string): Promise<string | undefined> => {
  try {
    const ai = getAIClient();
    const xPos = inputs.placement_point?.x || 50;
    const yPos = inputs.placement_point?.y || 50;
    
    const internalDetails = proposal.internal_layout.join(', ');

    const prompt = `
      OPPGAVE: Tegn møbelet ${inputs.productType} inn i bildet med ekstrem fotorealisme.
      
      PLASSERING OG FJERNING: 
      - Markøren er plassert ved x=${xPos.toFixed(1)}%, y=${yPos.toFixed(1)}%. Dette markerer midten av møbelets bakvegg.
      - VIKTIG: Hvis det står eksisterende møbler, hyller eller gjenstander i dette området, skal de FJERNES HELT (inpainting/cleanup). Det nye møbelet skal erstatte det gamle.
      
      ARKITEKTONISK RESPEKT:
      - Analyser døråpninger, dørkarmer og lister.
      - Møbelet skal ALDRI tegnes over eller dekke til dørblader, dørhåndtak eller åpne dørfelt hvis det står ved siden av en dør. Det skal stoppe nøyaktig ved dørkarmen.
      - Møbelet skal integreres bak lister eller dørkarmer som befinner seg i forgrunnen.
      
      UTFØRELSE:
      - Stil: ${proposal.style_package}.
      - Materiale: ${proposal.fronts.material.replace('_', ' ')} i fargen "${proposal.fronts.color}".
      - Detaljer: ${internalDetails}. Grep: ${proposal.handle_solution.replace(/_/g, ' ')}.
      ${refinementComment ? `- EKSTRA ENDRING FRA BRUKER: "${refinementComment}".` : ''}
      
      KVALITET: Fotorealistisk 3D-integrasjon. Lyssetting og skygger må samsvare perfekt med rommets eksisterende lyskilder.
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
    throw new Error("Ingen bilde generert.");
  } catch (err) {
    console.error("Visualiseringsfeil:", err);
    throw err;
  }
};

export const refineSpecificProposal = async (original: DesignProposal, comment: string, _inputs: UserInputs): Promise<DesignProposal> => {
  const ai = getAIClient();
  const { visual_image, ...currentProposalData } = original;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Oppdater dette møbelet i JSON-format basert på: "${comment}". Data: ${JSON.stringify(currentProposalData)}`,
    config: {
      systemInstruction: "Du er Snekker AIndersen. Returner kun oppdatert JSON-data.",
      responseMimeType: "application/json",
      responseSchema: PROPOSAL_SCHEMA
    }
  });

  const text = response.text;
  if (!text) throw new Error("Kunne ikke oppdatere.");
  return JSON.parse(text);
};