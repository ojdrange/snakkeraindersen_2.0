
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

export const generateFurnitureProposals = async (inputs: UserInputs): Promise<AIResponse> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

  const systemInstruction = `
    Du er Snekker AIndersen, en erfaren norsk møbelkonstruktør.
    Ditt fokus er KONSTRUKSJON og FUNKSJONALITET.
    
    Analysér brukerens beskrivelse for tekniske komponenter:
    - SKREVENT ANTALL: Hvis brukeren ber om f.eks. "3 skuffer" eller "2 dører", SKAL dette reflekteres i layout.
    - MATERIALER: Identifisér "glass", "speil" (speilfronter), "eik", "malt".
    - LED: Hvis "lys" eller "LED" nevnes, SKAL lighting.included være true.
    
    Du skal generere 5 varianter som tolker brukerens tekst på ulike måter.
    Bruk norsk språk i alle tekster.
  `;

  const prompt = `Konstruer 5 unike varianter av en ${inputs.productType}.
    DIMENSJONER: B:${inputs.width}mm, H:${inputs.height}mm, D:${inputs.depth}mm.
    BRUKERØNSKER: "${inputs.description}"
    HINDRINGER I ROMMET: "${inputs.constraints_text}"`;

  const imagePart = inputs.image ? {
    inlineData: {
      data: inputs.image.split(',')[1],
      mimeType: 'image/jpeg',
    }
  } : null;

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

  return JSON.parse(response.text || '{}');
};

export const visualizeProposal = async (baseImage: string, proposal: DesignProposal, inputs: UserInputs, refinementComment?: string): Promise<string | undefined> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const components = proposal.internal_layout.join(", ");
  const xPos = inputs.placement_point?.x || 50;
  const yPos = inputs.placement_point?.y || 50;
  
  const prompt = `
    OPPGAVE: Visualiser en fotorealistisk ${inputs.productType} integrert perfekt i rommet på bildet.
    
    PLASSERING (ABSULUTT VIKTIG): 
    Møbelet SKAL tegnes med senterpunkt nøyaktig på disse koordinatene i bildet: x=${xPos.toFixed(1)}%, y=${yPos.toFixed(1)}%.
    Dette punktet representerer bunnen/basen av møbelet mot veggen/gulvet.
    Respekter perspektivet i rommet fullt ut.
    
    TEKNISK KONSTRUKSJON:
    - KOMPONENTER: ${components}.
    - FRONT-MATERIALE: ${proposal.fronts.material} (${proposal.fronts.color}).
    - BELYSNING: ${proposal.lighting.included ? 'Inkluder integrert LED-lys (3000K) som lyser opp møbelet.' : 'Ingen lys.'}
    - MÅL: B:${proposal.dimensions_mm.width}mm, H:${proposal.dimensions_mm.height}mm.
    
    STIL: ${proposal.style_package}.
    ${refinementComment ? `BRUKERENS ENDRINGSØNSKE (SKAL UTFØRES): "${refinementComment}".` : ''}
    
    KVALITET: Fotorealistisk 3D-visualisering. Realistiske skygger som faller naturlig på gulv og vegger. Refleksjoner i flater hvis aktuelt. 
    Møbelet skal se ut som det er bygget inn i rommet på bildet.
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

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return undefined;
};

export const refineSpecificProposal = async (original: DesignProposal, comment: string, inputs: UserInputs): Promise<DesignProposal> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const { visual_image, ...currentProposalData } = original;

  const systemInstruction = `
    Du er Snekker AIndersen. Du skal oppdatere en eksisterende møbelkonstruksjon basert på brukerens ønske.
    Fokusér på strukturelle endringer (antall dører, materialvalg, belysning).
    
    Returner oppdatert JSON som følger samme skjema.
    Bruk norsk språk.
  `;

  const prompt = `
    OPPDATER KONSTRUKSJON.
    Nåværende design: ${JSON.stringify(currentProposalData)}
    BRUKERØNSKE OM ENDRING: "${comment}"
    
    Gjør de nødvendige endringene i materialer, layout og visual_notes.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: PROPOSAL_SCHEMA
    }
  });

  try {
    const updated = JSON.parse(response.text || '{}');
    return updated;
  } catch (e) {
    console.error("Feil ved parsing av oppdatert JSON fra AI", e);
    throw new Error("Snekkeren klarte ikke å forstå endringen din.");
  }
};
