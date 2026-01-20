
export type StylePackage = 'Modern Minimal' | 'Warm Nordic' | 'Clean Functional';
export type ProductType = 'Wardrobe' | 'TV Bench' | 'Bookcase' | 'Sideboard';

export interface RoomAnalysis {
  room_type: string;
  style_impression: string;
  floor_tone: 'warm' | 'neutral' | 'cold';
  wall_tone: 'light' | 'medium' | 'dark';
  constraints: string[];
}

export interface DesignProposal {
  id: string;
  style_package: StylePackage;
  carcass: {
    material: 'melamine';
    color: 'white' | 'black';
  };
  fronts: {
    material: 'painted_mdf' | 'oak_veneer' | 'ash_veneer';
    finish: 'smooth';
    color: string;
  };
  handle_solution: 'push_to_open' | 'integrated_grip';
  lighting: {
    included: boolean;
    type: 'integrated_led' | 'none';
  };
  dimensions_mm: {
    width: string;
    height: string;
    depth: string;
  };
  internal_layout: string[];
  visual_notes: string;
  production_notes: string;
  user_refinement?: string;
  visual_image?: string;
}

export interface AIResponse {
  room_analysis: RoomAnalysis;
  design_proposals: DesignProposal[];
}

export interface UserInputs {
  image: string | null;
  width: string;
  height: string;
  depth: string;
  constraints_text: string;
  productType: ProductType | null;
  description: string;
  placement_point?: { x: number; y: number }; // Percentage 0-100
  scale_reference?: {
    p1: { x: number; y: number };
    p2: { x: number; y: number };
    length_mm: number;
  };
}
