
import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, Ruler, Box, Sparkles, ChevronRight, Loader2, ArrowLeft, 
  CheckCircle2, AlertCircle, Layout, Tv, Book, Archive, MessageSquare, 
  Download, Printer, Save, RefreshCw, Image as ImageIcon, X, Maximize2,
  MapPin, Check, ChevronLeft, MousePointer2, FileText, Layers, ClipboardList
} from 'lucide-react';
import { UserInputs, AIResponse, ProductType, DesignProposal } from './types';
import { generateFurnitureProposals, refineSpecificProposal, visualizeProposal } from './geminiService';

type Step = 'upload' | 'scale' | 'dimensions' | 'placement' | 'product' | 'description' | 'processing' | 'results' | 'selected' | 'report';

export default function App() {
  const [step, setStep] = useState<Step>('upload');
  const [inputs, setInputs] = useState<UserInputs>({
    image: null,
    width: '',
    height: '',
    depth: '',
    constraints_text: '',
    productType: null,
    description: '',
  });
  const [results, setResults] = useState<AIResponse | null>(null);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefining, setIsRefining] = useState<string | null>(null); 
  const [renderProgress, setRenderProgress] = useState<{current: number, total: number} | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [scaleDrawing, setScaleDrawing] = useState<{p1?: {x: number, y: number}, p2?: {x: number, y: number}, tempLength?: string}>({});
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setInputs({ ...inputs, image: reader.result as string });
        setStep('scale');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleScaleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (!scaleDrawing.p1) {
      setScaleDrawing({ ...scaleDrawing, p1: { x, y } });
    } else if (!scaleDrawing.p2) {
      setScaleDrawing({ ...scaleDrawing, p2: { x, y } });
    } else {
      setScaleDrawing({ p1: { x, y } });
    }
  };

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setInputs({ ...inputs, placement_point: { x, y } });
  };

  const handleGenerate = async () => {
    setStep('processing');
    setError(null);
    try {
      const data = await generateFurnitureProposals(inputs);
      setResults(data);
      
      setRenderProgress({ current: 0, total: data.design_proposals.length });
      const updatedProposals = [...data.design_proposals];
      
      for (let i = 0; i < updatedProposals.length; i++) {
        setRenderProgress({ current: i + 1, total: updatedProposals.length });
        try {
          const visual = await visualizeProposal(inputs.image!, updatedProposals[i], inputs);
          if (visual) {
            updatedProposals[i] = { ...updatedProposals[i], visual_image: visual };
            setResults({ ...data, design_proposals: [...updatedProposals] });
          }
        } catch (vErr) {
          console.error("Visualization failed", vErr);
        }
      }
      
      setRenderProgress(null);
      setStep('results');
    } catch (err: any) {
      setError(err.message || "Kunne ikke generere forslag.");
      setStep('description');
    }
  };

  const handleRefine = async (proposalId: string) => {
    if (!results) return;
    const proposal = results.design_proposals.find(p => p.id === proposalId);
    if (!proposal || !proposal.user_refinement) return;

    const refinementComment = proposal.user_refinement;
    setIsRefining(proposalId);
    setError(null);

    try {
      const updated = await refineSpecificProposal(proposal, refinementComment, inputs);
      const visual = await visualizeProposal(inputs.image!, updated, inputs, refinementComment);
      
      if (!visual) throw new Error("Kunne ikke tegne det nye forslaget.");

      const newProposals = results.design_proposals.map(p => 
        p.id === proposalId ? { ...updated, visual_image: visual, user_refinement: refinementComment } : p
      );
      
      setResults({ ...results, design_proposals: newProposals });
    } catch (err: any) {
      console.error("Refinement error:", err);
      setError("Snekkeren klarte ikke å utføre endringen. Prøv en enklere beskrivelse.");
    } finally {
      setIsRefining(null);
    }
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    setIsGeneratingPDF(true);
    
    const element = reportRef.current;
    const opt = {
      margin: 0,
      filename: `AIndersen-Møbelrapport.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true, 
        letterRendering: true,
        scrollY: 0,
        windowWidth: 1200
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
      // @ts-ignore
      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.error("PDF Error", err);
      window.print();
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const reset = () => {
    if (confirm("Starte på nytt?")) {
      window.location.reload();
    }
  };

  const selectedProposal = results?.design_proposals.find(p => p.id === selectedProposalId);

  const productTypes: { type: ProductType, icon: any, label: string }[] = [
    { type: 'Wardrobe', icon: Archive, label: 'Garderobe' },
    { type: 'TV Bench', icon: Tv, label: 'TV-Benk' },
    { type: 'Bookcase', icon: Book, label: 'Bokhylle' },
    { type: 'Sideboard', icon: Layout, label: 'Sjenk / Skap' }
  ];

  const goBack = () => {
    const stepOrder: Step[] = ['upload', 'scale', 'dimensions', 'placement', 'product', 'description', 'results', 'selected', 'report'];
    const idx = stepOrder.indexOf(step);
    if (idx > 0) setStep(stepOrder[idx - 1]);
  };

  const goForward = () => {
    if (step === 'scale') setStep('dimensions');
    else if (step === 'dimensions' && inputs.width) setStep('placement');
    else if (step === 'placement' && inputs.placement_point) setStep('product');
    else if (step === 'product' && inputs.productType) setStep('description');
    else if (step === 'description') handleGenerate();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 font-sans print:bg-white print:pb-0">
      
      {selectedImage && (
        <div className="fixed inset-0 bg-black/95 z-[70] flex items-center justify-center p-4" onClick={() => setSelectedImage(null)}>
          <img src={selectedImage} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" alt="Fullvisning" />
        </div>
      )}

      <nav className="bg-white border-b sticky top-0 z-50 px-6 py-4 flex items-center justify-between shadow-sm print:hidden">
        <div className="flex items-center gap-3 cursor-pointer" onClick={reset}>
          <div className="bg-indigo-600 p-2 rounded-xl shadow-lg">
            <Box className="text-white w-5 h-5" />
          </div>
          <span className="font-extrabold text-xl tracking-tight">Snekker <span className="text-indigo-600 underline decoration-indigo-200 underline-offset-4">AIndersen</span></span>
        </div>
        
        <div className="flex gap-4">
          {step !== 'upload' && step !== 'processing' && step !== 'report' && (
            <button onClick={goBack} className="text-slate-500 hover:text-indigo-600 flex items-center gap-1 font-bold text-sm px-4 py-2 rounded-xl transition-all">
              <ChevronLeft className="w-4 h-4" /> Tilbake
            </button>
          )}
        </div>
      </nav>

      <main className="max-w-4xl mx-auto mt-8 px-4 print:mt-0 print:px-0">
        
        {step === 'upload' && (
          <div className="flex flex-col items-center text-center space-y-12 py-16 animate-in fade-in slide-in-from-bottom-8">
            <div className="space-y-4">
              <h1 className="text-5xl md:text-6xl font-black text-slate-900 tracking-tighter leading-none">
                Konstruer ditt <br />
                <span className="text-indigo-600 italic">perfekte møbel</span>
              </h1>
              <p className="text-xl text-slate-500 max-w-lg mx-auto font-medium">
                Last opp et bilde av nisjen eller veggen. <br />Vi tegner snekkerløsningen for deg.
              </p>
            </div>
            <div className="w-full max-w-md bg-white p-16 rounded-[3rem] border-4 border-dashed border-slate-200 hover:border-indigo-400 group relative cursor-pointer shadow-xl hover:shadow-2xl transition-all duration-500 overflow-hidden">
              <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
              <div className="flex flex-col items-center gap-8">
                <div className="p-8 bg-indigo-50 rounded-[2.5rem] group-hover:scale-110 transition-transform duration-500">
                  <Camera className="w-16 h-16 text-indigo-600" />
                </div>
                <div className="space-y-2">
                  <p className="font-black text-2xl tracking-tight">Start nytt prosjekt</p>
                  <p className="text-sm font-semibold text-slate-400">Trykk for å velge bilde</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'scale' && (
          <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-100 animate-in zoom-in-95 text-center">
            <h2 className="text-4xl font-black mb-4 flex items-center justify-center gap-3"><Ruler className="text-indigo-600" /> Kalibrering</h2>
            <p className="text-slate-500 mb-8 font-medium">Tegn en linje på noe du kjenner lengden på (f.eks dørkarm 210cm eller gulvlist).</p>
            
            <div className="relative w-full max-w-2xl mx-auto rounded-[2.5rem] overflow-hidden cursor-crosshair border-8 border-slate-50 shadow-inner" onClick={handleScaleClick}>
              <img ref={imageRef} src={inputs.image!} className="w-full block" alt="Skala" />
              {scaleDrawing.p1 && <div className="absolute w-4 h-4 bg-indigo-600 rounded-full border-4 border-white shadow-xl -translate-x-1/2 -translate-y-1/2" style={{left: `${scaleDrawing.p1.x}%`, top: `${scaleDrawing.p1.y}%`}} />}
              {scaleDrawing.p2 && <div className="absolute w-4 h-4 bg-indigo-600 rounded-full border-4 border-white shadow-xl -translate-x-1/2 -translate-y-1/2" style={{left: `${scaleDrawing.p2.x}%`, top: `${scaleDrawing.p2.y}%`}} />}
              {scaleDrawing.p1 && scaleDrawing.p2 && (
                <svg className="absolute inset-0 pointer-events-none w-full h-full">
                  <line x1={`${scaleDrawing.p1.x}%`} y1={`${scaleDrawing.p1.y}%`} x2={`${scaleDrawing.p2.x}%`} y2={`${scaleDrawing.p2.y}%`} stroke="#4f46e5" strokeWidth="6" strokeDasharray="12 6" />
                </svg>
              )}
            </div>

            <div className="mt-12 max-w-sm mx-auto space-y-6">
              {scaleDrawing.p1 && scaleDrawing.p2 && (
                <div className="animate-in slide-in-from-top-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Lengde på markert linje i mm</label>
                  <input 
                    type="number" placeholder="Eks: 2100" 
                    className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] focus:border-indigo-500 outline-none font-black text-center text-3xl shadow-inner"
                    value={scaleDrawing.tempLength || ''}
                    onChange={(e) => setScaleDrawing({...scaleDrawing, tempLength: e.target.value})}
                  />
                </div>
              )}
              <div className="flex gap-4">
                <button onClick={() => setStep('dimensions')} className="flex-1 py-5 bg-slate-100 text-slate-500 font-black rounded-[2rem] hover:bg-slate-200 transition-all">Hopp over</button>
                <button onClick={goForward} disabled={scaleDrawing.p1 && scaleDrawing.p2 && !scaleDrawing.tempLength ? true : false} className="flex-[2] py-5 bg-indigo-600 text-white font-black text-xl rounded-[2rem] shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3">Neste <ChevronRight className="w-6 h-6" /></button>
              </div>
            </div>
          </div>
        )}

        {step === 'dimensions' && (
          <div className="bg-white p-12 rounded-[3.5rem] shadow-2xl border border-slate-100 animate-in zoom-in-95">
            <h2 className="text-4xl font-black mb-10 tracking-tight">Dimensjoner på nytt møbel</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
              <div className="space-y-10">
                <div className="space-y-6">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ytre mål i millimeter (mm)</label>
                  <div className="grid grid-cols-3 gap-4">
                    {['width', 'height', 'depth'].map(field => (
                      <div key={field} className="space-y-2 text-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">{field === 'width' ? 'Bredde' : field === 'height' ? 'Høyde' : 'Dybde'}</p>
                        <input 
                          type="number" placeholder="mm"
                          className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none font-black text-center shadow-inner"
                          value={(inputs as any)[field]}
                          onChange={(e) => setInputs({...inputs, [field]: e.target.value})}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-6">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Beskrivelse av hindringer</label>
                  <textarea 
                    placeholder="Lister, stikkontakter, radiatorer, skråtak..."
                    className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl min-h-[120px] focus:border-indigo-500 outline-none resize-none font-medium shadow-inner"
                    value={inputs.constraints_text}
                    onChange={(e) => setInputs({...inputs, constraints_text: e.target.value})}
                  />
                </div>
                <div className="flex gap-4">
                  <button onClick={goBack} className="flex-1 py-5 bg-slate-100 text-slate-500 font-black rounded-[2rem] transition-all">Tilbake</button>
                  <button onClick={goForward} disabled={!inputs.width || !inputs.height || !inputs.depth} className="flex-[2] py-5 bg-indigo-600 text-white font-black text-xl rounded-[2rem] shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3">Neste <ChevronRight className="w-6 h-6" /></button>
                </div>
              </div>
              <div className="hidden md:flex flex-col gap-6">
                <div className="relative rounded-[2.5rem] overflow-hidden shadow-2xl border-4 border-slate-50 aspect-square">
                  <img src={inputs.image!} className="w-full h-full object-cover grayscale brightness-90" alt="Kontekst" />
                  <div className="absolute inset-0 bg-indigo-600/10 mix-blend-multiply" />
                </div>
                <div className="p-6 bg-indigo-50 rounded-[2rem] border border-indigo-100 flex items-start gap-4">
                  <AlertCircle className="text-indigo-600 w-6 h-6 shrink-0" />
                  <p className="text-sm font-bold text-indigo-700 leading-tight">Viktig: Sjekk at dybden stemmer med eventuelle dørkarmer eller vinduer i nærheten.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'placement' && (
          <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-100 animate-in zoom-in-95 text-center">
            <h2 className="text-4xl font-black mb-4">Plassering</h2>
            <p className="text-slate-500 mb-10 font-medium">Trykk der møbelet skal stå for å veilede tegneren.</p>
            <div className="relative w-full max-w-2xl mx-auto rounded-[3rem] overflow-hidden cursor-crosshair border-8 border-slate-50 shadow-inner group" onClick={handleImageClick}>
              <img ref={imageRef} src={inputs.image!} className="w-full block" alt="Plassering" />
              {inputs.placement_point && (
                <div className="absolute z-20 flex items-center justify-center pointer-events-none" style={{ left: `${inputs.placement_point.x}%`, top: `${inputs.placement_point.y}%`, transform: 'translate(-50%, -50%)' }}>
                  <div className="bg-indigo-600 text-white p-3 rounded-full shadow-2xl border-4 border-white animate-bounce">
                    <MapPin className="w-8 h-8" />
                  </div>
                </div>
              )}
            </div>
            <div className="mt-12 flex gap-4 max-w-md mx-auto">
              <button onClick={goBack} className="flex-1 py-5 bg-slate-100 text-slate-500 font-black rounded-[2rem] transition-all">Tilbake</button>
              <button onClick={goForward} disabled={!inputs.placement_point} className="flex-[2] py-5 bg-indigo-600 text-white font-black text-xl rounded-[2rem] shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3">Neste <ChevronRight className="w-6 h-6" /></button>
            </div>
          </div>
        )}

        {step === 'product' && (
          <div className="space-y-12 animate-in slide-in-from-right-8">
            <div className="text-center space-y-4">
              <h2 className="text-5xl font-black tracking-tighter">Velg møbeltype</h2>
              <p className="text-slate-500 font-medium">Hva slags konstruksjon skal vi tegne?</p>
            </div>
            <div className="grid grid-cols-2 gap-8">
              {productTypes.map((p) => (
                <button
                  key={p.type}
                  onClick={() => { setInputs({...inputs, productType: p.type}); setStep('description'); }}
                  className={`bg-white p-12 rounded-[3.5rem] border-4 transition-all flex flex-col items-center gap-6 group shadow-lg hover:shadow-2xl duration-500 ${inputs.productType === p.type ? 'border-indigo-600 scale-105 shadow-indigo-100' : 'border-transparent'}`}
                >
                  <div className={`p-8 rounded-[2.5rem] group-hover:bg-indigo-50 transition-all ${inputs.productType === p.type ? 'bg-indigo-100' : 'bg-slate-50'}`}>
                    <p.icon className={`w-16 h-16 group-hover:text-indigo-600 transition-all ${inputs.productType === p.type ? 'text-indigo-600' : 'text-slate-400'}`} />
                  </div>
                  <span className="font-black text-2xl text-slate-800 tracking-tight">{p.label}</span>
                </button>
              ))}
            </div>
            <button onClick={goBack} className="block mx-auto text-slate-400 font-black hover:text-indigo-600 transition-colors uppercase tracking-widest text-[10px]">Gå tilbake</button>
          </div>
        )}

        {step === 'description' && (
          <div className="bg-white p-12 rounded-[3.5rem] shadow-2xl animate-in zoom-in-95 max-w-2xl mx-auto border border-slate-100">
            <h2 className="text-4xl font-black mb-4 tracking-tight">Beskrivelse</h2>
            <p className="text-slate-500 mb-10 font-medium leading-relaxed">Vær spesifikk! Nevn antall dører, skuffer, bruk av glass, speil eller belysning. Jo mer detaljer, jo bedre tegning.</p>
            <textarea 
              placeholder="Eks: Garderobe med 4 dører. De to i midten skal være i speil. 3 dype skuffer nederst. Integrert LED i toppen..."
              className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] min-h-[180px] text-xl font-medium focus:border-indigo-500 outline-none resize-none shadow-inner leading-relaxed"
              value={inputs.description}
              onChange={(e) => setInputs({...inputs, description: e.target.value})}
            />
            {error && (
              <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 font-bold text-sm">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="mt-10 flex gap-4">
              <button onClick={goBack} className="flex-1 py-6 bg-slate-100 text-slate-500 font-black rounded-[2.5rem] transition-all">Tilbake</button>
              <button onClick={handleGenerate} className="flex-[2] py-6 bg-indigo-600 text-white font-black text-2xl rounded-[2.5rem] shadow-2xl hover:bg-indigo-700 transition-all active:scale-95">Generer forslag</button>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center py-40 space-y-10 animate-in fade-in">
            <div className="relative">
              <Loader2 className="w-32 h-32 text-indigo-600 animate-spin" />
              <Sparkles className="w-12 h-12 text-indigo-400 absolute -top-4 -right-4 animate-pulse" />
            </div>
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-black text-slate-900 tracking-tight">
                {renderProgress ? `Tegner variant 0${renderProgress.current}...` : 'Analyserer rommet...'}
              </h2>
              <p className="text-slate-400 font-bold text-lg">Våre AI-snekkere beregner konstruksjonen nå.</p>
              {renderProgress && (
                <div className="w-80 h-4 bg-slate-200 rounded-full mt-10 mx-auto overflow-hidden shadow-inner p-1">
                  <div className="h-full bg-indigo-600 rounded-full transition-all duration-700 shadow-lg shadow-indigo-200" style={{width: `${(renderProgress.current / renderProgress.total) * 100}%`}} />
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'results' && results && (
          <div className="space-y-16 animate-in fade-in">
            <div className="text-center space-y-4">
              <h2 className="text-5xl font-black tracking-tighter">Konstruksjonsforslag</h2>
              <p className="text-slate-500 text-lg font-medium">Vi har tegnet 5 ulike varianter basert på dine mål og ønsker.</p>
            </div>

            <div className="grid grid-cols-1 gap-16">
              {results.design_proposals.map((proposal, idx) => (
                <div key={proposal.id} className="bg-white rounded-[3.5rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col md:row group hover:shadow-indigo-50 transition-all duration-700">
                  <div className="md:w-1/2 bg-slate-900 relative cursor-zoom-in min-h-[400px]" onClick={() => proposal.visual_image && setSelectedImage(proposal.visual_image)}>
                    {proposal.visual_image ? (
                      <img src={proposal.visual_image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" alt="Tegning" />
                    ) : (
                      <div className="h-full flex items-center justify-center text-white/20"><Loader2 className="animate-spin w-12 h-12" /></div>
                    )}
                    <div className="absolute top-8 left-8 z-10">
                       <span className="bg-indigo-600 text-white px-6 py-2 rounded-full text-xs font-black uppercase tracking-[0.2em] shadow-2xl">Variant 0{idx+1}</span>
                    </div>
                  </div>
                  
                  <div className="md:w-1/2 p-12 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-8">
                        <h3 className="text-3xl font-black uppercase tracking-tight text-slate-800 leading-none">{proposal.style_package}</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-6 mb-8">
                        <div><p className="text-[10px] font-black text-slate-300 uppercase mb-1">Frontmateriale</p><p className="text-sm font-bold text-slate-700">{proposal.fronts.material.replace('_', ' ')}</p></div>
                        <div><p className="text-[10px] font-black text-slate-300 uppercase mb-1">Farge</p><p className="text-sm font-bold text-slate-700">{proposal.fronts.color}</p></div>
                      </div>
                      <div className="mb-10 space-y-4">
                        <p className="text-[10px] font-black text-indigo-500 uppercase flex items-center gap-2"><Layers className="w-4 h-4" /> Konstruksjonsdetaljer</p>
                        <div className="grid grid-cols-1 gap-2">
                          {proposal.internal_layout.map((item, i) => (
                            <div key={i} className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs font-bold text-slate-600">
                              <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" /> {item}
                            </div>
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-slate-400 leading-relaxed italic border-l-4 border-indigo-100 pl-6 mb-10">"{proposal.production_notes}"</p>
                    </div>
                    <button 
                      onClick={() => { setSelectedProposalId(proposal.id); setStep('selected'); }}
                      className="w-full py-5 bg-slate-900 hover:bg-indigo-600 text-white font-black text-lg rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl active:scale-95"
                    >
                      Velg denne løsningen <Check className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex justify-center pb-12 gap-8">
               <button onClick={goBack} className="text-indigo-600 font-black hover:underline flex items-center gap-2 uppercase tracking-widest text-[10px]">Endre instruks</button>
               <button onClick={reset} className="text-slate-400 font-black hover:text-red-500 transition-colors uppercase tracking-widest text-[10px]">Start helt på nytt</button>
            </div>
          </div>
        )}

        {step === 'selected' && selectedProposal && (
          <div className="max-w-2xl mx-auto space-y-12 animate-in zoom-in-95">
            <div className="text-center space-y-2">
              <h2 className="text-5xl font-black tracking-tighter">Gjør finjusteringer</h2>
              <p className="text-slate-500 font-medium">Her kan du be om endringer på det valgte designet.</p>
            </div>
            
            <div className="bg-white rounded-[3.5rem] shadow-2xl overflow-hidden border border-slate-100">
               <div className="relative h-96">
                 <img src={selectedProposal.visual_image} className="w-full h-full object-cover cursor-zoom-in" onClick={() => setSelectedImage(selectedProposal.visual_image!)} alt="Valgt" />
                 <button onClick={goBack} className="absolute top-6 left-6 bg-white/90 backdrop-blur-md text-slate-800 px-6 py-3 rounded-full font-black text-xs flex items-center gap-2 shadow-2xl hover:bg-white transition-all uppercase tracking-widest">
                   <ChevronLeft className="w-4 h-4" /> Bytte variant
                 </button>
                 {isRefining === selectedProposal.id && (
                   <div className="absolute inset-0 bg-white/60 backdrop-blur-md flex items-center justify-center z-20">
                     <div className="text-center space-y-4">
                       <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mx-auto" />
                       <p className="font-black text-xl uppercase tracking-tight">Oppdaterer snekkertegning...</p>
                     </div>
                   </div>
                 )}
               </div>
               <div className="p-12 space-y-10">
                  <div className="flex justify-between items-end border-b-2 border-slate-50 pb-8">
                    <div className="space-y-1">
                      <h3 className="text-4xl font-black uppercase tracking-tight leading-none">{selectedProposal.style_package}</h3>
                      <p className="text-indigo-600 font-black text-sm uppercase tracking-widest">Eksklusiv skreddersøm</p>
                    </div>
                    <div className="text-right">
                       <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Mål</p>
                       <p className="font-black text-xl text-slate-800">{selectedProposal.dimensions_mm.width} × {selectedProposal.dimensions_mm.height} mm</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                     <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                       <MessageSquare className="w-4 h-4 text-indigo-400" /> Endringsønske
                     </label>
                     <textarea 
                        placeholder="Eks: Kan vi få én dør til? Bytt glasset med speil..."
                        className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] min-h-[140px] focus:border-indigo-500 outline-none resize-none font-medium shadow-inner leading-relaxed"
                        value={selectedProposal.user_refinement || ''}
                        onChange={(e) => {
                          const newProposals = results!.design_proposals.map(p => p.id === selectedProposal.id ? { ...p, user_refinement: e.target.value } : p);
                          setResults({ ...results!, design_proposals: newProposals });
                        }}
                     />
                     <button 
                       onClick={() => handleRefine(selectedProposal.id)}
                       disabled={isRefining === selectedProposal.id || !selectedProposal.user_refinement}
                       className="w-full py-5 bg-indigo-600 text-white font-black text-lg rounded-[2rem] shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 disabled:opacity-50 active:scale-95"
                     >
                       <Sparkles className="w-5 h-5" /> Oppdater tegning
                     </button>
                     {error && <p className="text-red-500 text-xs font-bold text-center mt-2">{error}</p>}
                  </div>

                  <div className="flex gap-6 pt-4">
                     <button onClick={goBack} className="flex-1 py-6 bg-slate-100 text-slate-500 font-black rounded-[2.5rem] transition-all">Tilbake</button>
                     <button onClick={() => setStep('report')} className="flex-[2] py-6 bg-slate-900 text-white font-black text-xl rounded-[2.5rem] shadow-2xl hover:bg-black transition-all flex items-center justify-center gap-4">Se full rapport <Download className="w-6 h-6" /></button>
                  </div>
               </div>
            </div>
          </div>
        )}

        {step === 'report' && selectedProposal && (
          <div className="animate-in fade-in py-12 print:py-0">
            <div ref={reportRef} id="pdf-report-content" className="pdf-report-layout bg-white shadow-2xl print:shadow-none border border-slate-100 report-container">
              
              <div className="p-16 min-h-[1000px] flex flex-col justify-between">
                <div>
                  <div className="border-b-8 border-slate-900 pb-12 mb-12 flex justify-between items-end">
                    <div className="space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="bg-slate-900 p-3 rounded-2xl shadow-xl">
                          <Box className="text-white w-8 h-8" />
                        </div>
                        <span className="font-black text-4xl tracking-tighter">Snekker AIndersen</span>
                      </div>
                      <div>
                        <h1 className="text-6xl font-black uppercase tracking-tighter leading-none mb-3 text-slate-900">Prosjektrapport</h1>
                        <div className="flex gap-4">
                          <p className="text-slate-400 font-black uppercase tracking-widest text-[11px]">ID: MOB-{Math.floor(Math.random()*10000)}</p>
                          <p className="text-slate-400 font-black uppercase tracking-widest text-[11px]">Dato: {new Date().toLocaleDateString('no-NO')}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right print:hidden flex gap-4">
                      <button onClick={handleDownloadPDF} disabled={isGeneratingPDF} className="bg-indigo-600 text-white px-10 py-5 rounded-[2.5rem] font-black text-lg flex items-center gap-4 shadow-2xl hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50">
                        {isGeneratingPDF ? <Loader2 className="animate-spin w-6 h-6" /> : <Download className="w-6 h-6" />}
                        Last ned PDF
                      </button>
                      <button onClick={() => window.print()} className="bg-slate-900 text-white px-10 py-5 rounded-[2.5rem] font-black text-lg flex items-center gap-4 shadow-2xl hover:bg-slate-800 transition-all active:scale-95">
                        <Printer className="w-6 h-6" /> Skriv ut
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-16 mb-20">
                    <div className="space-y-10">
                        <div className="space-y-4">
                          <h2 className="text-xs font-black uppercase tracking-[0.3em] text-indigo-500 border-b-2 border-indigo-50 pb-2 flex items-center gap-2"><ClipboardList className="w-4 h-4" /> Spesifikasjoner</h2>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-sm"><p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Type</p><p className="font-black text-xl text-slate-800">{inputs.productType}</p></div>
                            <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-sm"><p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Status</p><p className="font-black text-xl text-indigo-600">Konstruert</p></div>
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-sm text-center"><p className="text-[10px] font-black text-slate-300 uppercase mb-1">Bredde</p><p className="font-black text-xl text-slate-800">{inputs.width}mm</p></div>
                            <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-sm text-center"><p className="text-[10px] font-black text-slate-300 uppercase mb-1">Høyde</p><p className="font-black text-xl text-slate-800">{inputs.height}mm</p></div>
                            <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-sm text-center"><p className="text-[10px] font-black text-slate-300 uppercase mb-1">Dybde</p><p className="font-black text-xl text-slate-800">{inputs.depth}mm</p></div>
                          </div>
                        </div>
                        <div className="p-8 bg-indigo-50 rounded-[2.5rem] border border-indigo-100">
                          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4">Beskrivelse og behov</p>
                          <p className="text-base font-bold text-indigo-900 italic leading-relaxed">"{inputs.description || 'Ingen spesifisert.'}"</p>
                        </div>
                    </div>
                    <div className="relative group overflow-hidden rounded-[3rem] border-4 border-slate-50 shadow-2xl">
                        <img src={inputs.image!} className="w-full h-full object-cover grayscale brightness-75" alt="Befaring" />
                        {inputs.placement_point && (
                          <div className="absolute z-10 flex items-center justify-center pointer-events-none" style={{ left: `${inputs.placement_point.x}%`, top: `${inputs.placement_point.y}%`, transform: 'translate(-50%, -50%)' }}>
                            <div className="bg-indigo-600 text-white p-2 rounded-full shadow-2xl border-2 border-white">
                              <MapPin className="w-5 h-5" />
                            </div>
                          </div>
                        )}
                        <div className="absolute top-8 right-8 bg-slate-900 text-white px-8 py-3 text-[11px] font-black uppercase tracking-widest rounded-full shadow-2xl">Befaringsfoto</div>
                    </div>
                  </div>
                </div>
                <div className="text-center opacity-30 mt-auto">
                  <p className="text-xs font-black uppercase tracking-[0.6em]">Side 1 / 2</p>
                </div>
              </div>

              <div className="html2pdf__page-break"></div>

              <div className="p-16 min-h-[1000px] flex flex-col">
                <div className="mb-12">
                  <h2 className="text-xs font-black uppercase tracking-[0.3em] text-indigo-500 border-b-2 border-indigo-50 pb-2 flex items-center gap-2"><Layout className="w-4 h-4" /> Konstruksjonstegning</h2>
                </div>
                
                <div className="grid grid-cols-12 gap-12 flex-grow">
                   <div className="col-span-12">
                      <div className="relative overflow-hidden rounded-[3.5rem] shadow-2xl border-8 border-slate-50 mb-12">
                        <img src={selectedProposal.visual_image} className="w-full h-auto max-h-[550px] object-cover" alt="Visualisering" />
                        <div className="absolute bottom-10 left-10 bg-white/90 backdrop-blur-md px-8 py-4 rounded-[2rem] shadow-2xl border border-slate-100">
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Valgt stil</p>
                           <p className="font-black text-2xl text-slate-900 uppercase tracking-tight">{selectedProposal.style_package}</p>
                        </div>
                      </div>
                   </div>
                   
                   <div className="col-span-12 grid grid-cols-1 md:grid-cols-2 gap-12">
                      <div className="p-10 bg-slate-50 rounded-[3.5rem] border border-slate-100 shadow-xl space-y-8">
                         <div className="space-y-4">
                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2">Materialvalg</p>
                            <div className="flex justify-between border-b border-slate-200 pb-2"><p className="text-[11px] font-black text-slate-400 uppercase">Fronter</p><p className="font-black text-slate-700">{selectedProposal.fronts.material.replace('_', ' ')}</p></div>
                            <div className="flex justify-between border-b border-slate-200 pb-2"><p className="text-[11px] font-black text-slate-400 uppercase">Farge</p><p className="font-black text-slate-700">{selectedProposal.fronts.color}</p></div>
                            <div className="flex justify-between border-b border-slate-200 pb-2"><p className="text-[11px] font-black text-slate-400 uppercase">Stamme</p><p className="font-black text-slate-700">{selectedProposal.carcass.color === 'white' ? 'Hvit' : 'Sort'} Melamin</p></div>
                            <div className="flex justify-between border-b border-slate-200 pb-2"><p className="text-[11px] font-black text-slate-400 uppercase">Håndtak</p><p className="font-black text-slate-700">{selectedProposal.handle_solution.replace(/_/g, ' ')}</p></div>
                         </div>
                         {selectedProposal.user_refinement && (
                           <div className="bg-indigo-600 text-white p-6 rounded-[2rem] shadow-xl italic font-bold text-xs leading-relaxed">
                             "Siste justering: {selectedProposal.user_refinement}"
                           </div>
                         )}
                      </div>

                      <div className="p-10 bg-slate-50 rounded-[3.5rem] border border-slate-100 shadow-xl space-y-6">
                        <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2"><Layers className="w-4 h-4" /> Konstruksjonstabell</p>
                        <div className="grid grid-cols-1 gap-2">
                          {selectedProposal.internal_layout.map((item, i) => (
                            <div key={i} className="flex items-start gap-3 bg-white p-3 rounded-xl border border-slate-100 text-[11px] font-bold text-slate-700 leading-tight">
                              <div className="w-2 h-2 rounded-full bg-indigo-600 mt-1 shrink-0" /> {item}
                            </div>
                          ))}
                        </div>
                      </div>
                   </div>
                </div>

                <div className="mt-20 pt-12 border-t-4 border-slate-900 text-center">
                   <p className="text-base font-black uppercase tracking-[0.5em] mb-2 text-slate-900">Snekker AIndersen • Skreddersøm</p>
                   <p className="text-[10px] text-slate-400 max-w-xl mx-auto leading-relaxed font-bold">
                     Dette er et digitalt konstruksjonsgrunnlag. Alle mål må bekreftes før produksjon. 
                     Vi tar forbehold om avvik i visualiseringen. Side 2 / 2
                   </p>
                </div>
              </div>

            </div>

            <div className="mt-16 flex justify-center gap-8 print:hidden">
               <button onClick={reset} className="px-12 py-6 bg-white border-2 border-slate-200 text-slate-600 font-black rounded-[2.5rem] hover:bg-slate-50 shadow-xl transition-all uppercase tracking-widest text-xs">Ny befaring</button>
               <button onClick={() => setStep('selected')} className="px-12 py-6 bg-slate-900 text-white font-black rounded-[2.5rem] hover:bg-slate-800 shadow-2xl transition-all uppercase tracking-widest text-xs">Endre design</button>
            </div>
          </div>
        )}
      </main>
      
      <footer className="mt-32 py-16 border-t border-slate-100 text-center opacity-30 print:hidden">
         <div className="flex items-center justify-center gap-3 mb-2">
            <Box className="w-5 h-5" />
            <p className="text-xs font-black uppercase tracking-[0.6em]">Snekker AIndersen AI-Engine v4.0 • Oslo, Norge</p>
         </div>
      </footer>
    </div>
  );
}
