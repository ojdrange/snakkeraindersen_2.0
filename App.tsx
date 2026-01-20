import React, { useState, useRef } from 'react';
import { 
  Camera, Ruler, Box, Sparkles, ChevronRight, Loader2, 
  CheckCircle2, AlertCircle, Layout, Tv, Book, Archive, MessageSquare, 
  Download, Printer, Maximize2, MapPin, ChevronLeft, RefreshCw, X,
  ClipboardList, Layers, FileText, Info
} from 'lucide-react';
import { UserInputs, AIResponse, ProductType, DesignProposal } from './types';
import { generateFurnitureProposals, refineSpecificProposal, visualizeProposal } from './geminiService';

type Step = 'upload' | 'scale' | 'dimensions' | 'placement' | 'product' | 'description' | 'processing' | 'results' | 'selected' | 'report';

const productTypes: { type: ProductType; label: string; icon: any }[] = [
  { type: 'Wardrobe', label: 'Garderobe', icon: Archive },
  { type: 'TV Bench', label: 'TV-benk', icon: Tv },
  { type: 'Bookcase', label: 'Bokhylle', icon: Book },
  { type: 'Sideboard', label: 'Skjenk', icon: Layout },
];

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
  const [variantErrors, setVariantErrors] = useState<Record<string, string>>({});
  
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

    if (!scaleDrawing.p1) setScaleDrawing({ ...scaleDrawing, p1: { x, y } });
    else if (!scaleDrawing.p2) setScaleDrawing({ ...scaleDrawing, p2: { x, y } });
    else setScaleDrawing({ p1: { x, y } });
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
    setVariantErrors({});
    try {
      const data = await generateFurnitureProposals(inputs);
      setResults(data);
      setStep('results');
      
      const total = data.design_proposals.length;
      let completedCount = 0;
      setRenderProgress({ current: 0, total });

      for (const proposal of data.design_proposals) {
        await generateSingleImage(proposal.id, proposal);
        completedCount++;
        setRenderProgress({ current: completedCount, total });
      }
      setRenderProgress(null);
    } catch (err: any) {
      setError(err.message || "Klarte ikke å koble til snekker-motoren.");
      setStep('description');
    }
  };

  const generateSingleImage = async (proposalId: string, proposal: DesignProposal) => {
    setVariantErrors(prev => { const n = {...prev}; delete n[proposalId]; return n; });
    try {
      const visual = await visualizeProposal(inputs.image!, proposal, inputs);
      setResults(prev => {
        if (!prev) return null;
        return {
          ...prev,
          design_proposals: prev.design_proposals.map(p => 
            p.id === proposalId ? { ...p, visual_image: visual } : p
          )
        };
      });
    } catch (err: any) {
      console.error(`Tegnefeil for variant ${proposalId}:`, err);
      // Vis den faktiske tekniske feilen for å hjelpe brukeren
      const errorMessage = err.message?.includes('403') ? "Ingen tilgang (Sjekk API-nøkkel)" : 
                          err.message?.includes('429') ? "For mange forespørsler. Vent litt." : 
                          err.message || "Tegningen feilet";
      setVariantErrors(prev => ({ ...prev, [proposalId]: errorMessage }));
    }
  };

  const handleRefine = async (proposalId: string) => {
    if (!results) return;
    const proposal = results.design_proposals.find(p => p.id === proposalId);
    if (!proposal || !proposal.user_refinement) return;
    setIsRefining(proposalId);
    try {
      const updated = await refineSpecificProposal(proposal, proposal.user_refinement, inputs);
      const visual = await visualizeProposal(inputs.image!, updated, inputs, proposal.user_refinement);
      setResults({
        ...results,
        design_proposals: results.design_proposals.map(p => 
          p.id === proposalId ? { ...updated, visual_image: visual, user_refinement: proposal.user_refinement } : p
        )
      });
    } catch (err) {
      setError("Klarte ikke å oppdatere.");
    } finally {
      setIsRefining(null);
    }
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    setIsGeneratingPDF(true);
    try {
      const opt = {
        margin: [0, 0, 0, 0],
        filename: `AIndersen-Prosjekt-${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 1.0 },
        html2canvas: { 
          scale: 3, 
          useCORS: true,
          letterRendering: true,
          scrollY: 0,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: 'css', before: '.page-break' }
      };
      // @ts-ignore
      await html2pdf().set(opt).from(reportRef.current).save();
    } catch (err) {
      console.error("PDF-feil:", err);
      window.print();
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const reset = () => { if (confirm("Vil du virkelig starte på nytt?")) window.location.reload(); };

  const selectedProposal = results?.design_proposals.find(p => p.id === selectedProposalId);

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
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 font-sans print:bg-white overflow-x-hidden">
      {selectedImage && (
        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 animate-in fade-in" onClick={() => setSelectedImage(null)}>
          <button className="absolute top-6 right-6 text-white p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-8 h-8" /></button>
          <img src={selectedImage} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" alt="Fullvisning" />
        </div>
      )}

      <nav className="bg-white/90 backdrop-blur-xl border-b sticky top-0 z-50 px-4 py-4 flex items-center justify-between shadow-sm print:hidden transition-all duration-300">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={reset}>
          <div className="bg-indigo-600 p-2 rounded-xl shadow-lg group-hover:rotate-12 transition-transform"><Box className="text-white w-5 h-5" /></div>
          <span className="font-extrabold text-lg md:text-xl tracking-tight">Snekker <span className="text-indigo-600">AIndersen</span></span>
        </div>
        <div className="flex items-center gap-2">
          {step !== 'upload' && step !== 'processing' && (
            <button onClick={goBack} className="text-slate-500 font-bold text-xs md:text-sm px-3 md:px-4 py-2 rounded-xl hover:bg-slate-100 flex items-center gap-1 transition-colors"><ChevronLeft className="w-4 h-4" /> Tilbake</button>
          )}
        </div>
      </nav>

      <main className={`${step === 'results' ? 'max-w-[1400px]' : 'max-w-4xl'} mx-auto mt-6 md:mt-10 px-4 transition-all duration-700`}>
        {step === 'upload' && (
          <div className="flex flex-col items-center text-center space-y-12 py-10 md:py-20 animate-in fade-in slide-in-from-bottom-8">
            <div className="space-y-6">
              <h1 className="text-4xl md:text-7xl font-black text-slate-900 tracking-tighter leading-[1.1]">Konstruer ditt <br /><span className="text-indigo-600 italic underline decoration-indigo-200 underline-offset-[10px]">perfekte møbel</span></h1>
              <p className="text-lg md:text-xl text-slate-500 max-w-lg mx-auto font-medium leading-relaxed px-4">Last opp et bilde av nisjen, veggen eller rommet du ønsker å innrede.</p>
            </div>
            <div className="w-full max-w-md bg-white p-10 md:p-16 rounded-[2.5rem] md:rounded-[3.5rem] border-4 border-dashed border-slate-200 hover:border-indigo-400 group relative cursor-pointer shadow-2xl transition-all overflow-hidden mx-auto">
              <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
              <div className="flex flex-col items-center gap-8">
                <div className="p-8 bg-indigo-50 rounded-[2.5rem] group-hover:scale-110 group-hover:bg-indigo-100 transition-all duration-500"><Camera className="w-12 h-12 md:w-16 md:h-16 text-indigo-600" /></div>
                <div className="space-y-2">
                  <p className="font-black text-xl md:text-2xl text-slate-800">Velg et bilde</p>
                  <p className="text-sm font-semibold text-slate-400">Dra og slipp eller trykk her</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'scale' && (
          <div className="bg-white p-6 md:p-12 rounded-[2rem] md:rounded-[3rem] shadow-2xl border border-slate-100 animate-in zoom-in-95 text-center">
            <h2 className="text-2xl md:text-3xl font-black mb-4 flex items-center justify-center gap-3"><Ruler className="text-indigo-600" /> Kalibrering</h2>
            <p className="text-slate-500 mb-8 font-medium max-w-md mx-auto">Marker to punkter med en kjent avstand (f.eks dørkarm på 210cm).</p>
            <div className="relative w-full rounded-2xl overflow-hidden cursor-crosshair border-4 border-slate-50 shadow-inner group" onClick={handleScaleClick}>
              <img ref={imageRef} src={inputs.image!} className="w-full h-auto block" alt="Skala" />
              {scaleDrawing.p1 && <div className="absolute w-5 h-5 bg-indigo-600 rounded-full border-2 border-white shadow-2xl -translate-x-1/2 -translate-y-1/2 z-20" style={{left: `${scaleDrawing.p1.x}%`, top: `${scaleDrawing.p1.y}%`}} />}
              {scaleDrawing.p2 && <div className="absolute w-5 h-5 bg-indigo-600 rounded-full border-2 border-white shadow-2xl -translate-x-1/2 -translate-y-1/2 z-20" style={{left: `${scaleDrawing.p2.x}%`, top: `${scaleDrawing.p2.y}%`}} />}
              {scaleDrawing.p1 && scaleDrawing.p2 && <svg className="absolute inset-0 pointer-events-none w-full h-full z-10"><line x1={`${scaleDrawing.p1.x}%`} y1={`${scaleDrawing.p1.y}%`} x2={`${scaleDrawing.p2.x}%`} y2={`${scaleDrawing.p2.y}%`} stroke="#4f46e5" strokeWidth="4" strokeDasharray="8 8" /></svg>}
            </div>
            <div className="mt-10 max-w-sm mx-auto space-y-6">
              {scaleDrawing.p1 && scaleDrawing.p2 && (
                <div className="animate-in slide-in-from-top-4">
                  <label className="text-[10px] font-black uppercase text-slate-400 mb-3 block tracking-widest">Lengde mellom punkter (mm)</label>
                  <input type="number" placeholder="f.eks 2100" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl focus:border-indigo-500 outline-none font-black text-center text-3xl shadow-inner transition-all" value={scaleDrawing.tempLength || ''} onChange={(e) => setScaleDrawing({...scaleDrawing, tempLength: e.target.value})} />
                </div>
              )}
              <div className="flex gap-4">
                <button onClick={() => setStep('dimensions')} className="flex-1 py-5 bg-slate-100 text-slate-500 font-black rounded-2xl hover:bg-slate-200 transition-all text-sm uppercase tracking-widest">Hopp over</button>
                <button onClick={goForward} disabled={scaleDrawing.p1 && scaleDrawing.p2 && !scaleDrawing.tempLength ? true : false} className="flex-[2] py-5 bg-indigo-600 text-white font-black text-lg rounded-2xl shadow-xl hover:bg-indigo-700 transition-all disabled:opacity-50 uppercase tracking-widest">Neste</button>
              </div>
            </div>
          </div>
        )}

        {step === 'dimensions' && (
          <div className="bg-white p-6 md:p-12 rounded-[2rem] md:rounded-[3.5rem] shadow-2xl border border-slate-100 animate-in zoom-in-95">
            <h2 className="text-3xl md:text-5xl font-black mb-10 tracking-tighter text-center">Yttermål på møbelet</h2>
            <div className="space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {['width', 'height', 'depth'].map(f => (
                  <div key={f} className="space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">{f === 'width' ? 'Bredde' : f === 'height' ? 'Høyde' : 'Dybde'}</p>
                    <div className="relative">
                      <input type="number" placeholder="mm" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl focus:border-indigo-500 outline-none font-black text-center text-3xl shadow-inner transition-all" value={(inputs as any)[f]} onChange={(e) => setInputs({...inputs, [f]: e.target.value})} />
                      <span className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 font-bold">mm</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4 flex items-center gap-2"><Info className="w-3 h-3" /> Hindringer og merknader</label>
                <textarea placeholder="Lister, stikkontakter, skråtak..." className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] min-h-[160px] focus:border-indigo-500 outline-none resize-none font-medium shadow-inner leading-relaxed transition-all" value={inputs.constraints_text} onChange={(e) => setInputs({...inputs, constraints_text: e.target.value})} />
              </div>
              <button onClick={goForward} disabled={!inputs.width || !inputs.height || !inputs.depth} className="w-full py-8 bg-indigo-600 text-white font-black text-2xl rounded-[2.5rem] shadow-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-4 group disabled:opacity-50">Fortsett <ChevronRight className="w-8 h-8 group-hover:translate-x-1 transition-transform" /></button>
            </div>
          </div>
        )}

        {step === 'placement' && (
          <div className="bg-white p-6 md:p-12 rounded-[2rem] md:rounded-[3rem] shadow-2xl border border-slate-100 animate-in zoom-in-95 text-center">
            <h2 className="text-3xl md:text-4xl font-black mb-4">Plassering i rommet</h2>
            <p className="text-slate-500 mb-10 font-medium max-w-md mx-auto">Trykk i bildet der møbelet skal stå.</p>
            <div className="relative w-full rounded-[2rem] overflow-hidden cursor-crosshair border-8 border-slate-50 shadow-inner ring-1 ring-slate-200 group" onClick={handleImageClick}>
              <img src={inputs.image!} className="w-full h-auto block" alt="Plassering" />
              {inputs.placement_point && (
                <div className="absolute z-20 flex items-center justify-center pointer-events-none" style={{ left: `${inputs.placement_point.x}%`, top: `${inputs.placement_point.y}%`, transform: 'translate(-50%, -50%)' }}>
                  <div className="bg-indigo-600 text-white p-4 rounded-full shadow-2xl border-4 border-white animate-bounce">
                    <MapPin className="w-8 h-8 md:w-10 md:h-10" />
                  </div>
                </div>
              )}
            </div>
            <button onClick={goForward} disabled={!inputs.placement_point} className="mt-12 w-full max-w-md mx-auto py-6 md:py-8 bg-indigo-600 text-white font-black text-xl md:text-2xl rounded-3xl shadow-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-4 group disabled:opacity-50 uppercase tracking-widest">Bekreft posisjon <ChevronRight className="w-6 h-6 md:w-8 md:h-8 group-hover:translate-x-1 transition-transform" /></button>
          </div>
        )}

        {step === 'product' && (
          <div className="space-y-12 animate-in slide-in-from-right-8 py-10">
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-center">Hva bygger vi?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {productTypes.map((p) => (
                <button key={p.type} onClick={() => { setInputs({...inputs, productType: p.type}); setStep('description'); }} className={`bg-white p-10 rounded-[2.5rem] border-4 transition-all flex flex-col items-center gap-6 group shadow-lg hover:shadow-2xl hover:scale-105 ${inputs.productType === p.type ? 'border-indigo-600' : 'border-transparent'}`}>
                  <div className={`p-8 rounded-[2rem] transition-all group-hover:bg-indigo-50 ${inputs.productType === p.type ? 'bg-indigo-100' : 'bg-slate-50'}`}><p.icon className={`w-12 h-12 md:w-14 md:h-14 ${inputs.productType === p.type ? 'text-indigo-600' : 'text-slate-400'}`} /></div>
                  <span className="font-black text-xl text-slate-800 tracking-tight text-center">{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'description' && (
          <div className="bg-white p-8 md:p-16 rounded-[2.5rem] md:rounded-[3.5rem] shadow-2xl animate-in zoom-in-95 max-w-2xl mx-auto border border-slate-100">
            <h2 className="text-3xl md:text-5xl font-black mb-8 tracking-tighter text-center">Dine ønsker</h2>
            <div className="space-y-8">
              <textarea placeholder="Farger, materialer, antall dører..." className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] min-h-[220px] text-xl font-medium focus:border-indigo-500 outline-none resize-none shadow-inner leading-relaxed transition-all" value={inputs.description} onChange={(e) => setInputs({...inputs, description: e.target.value})} />
              {error && <div className="p-5 bg-red-50 border border-red-100 rounded-3xl flex items-center gap-4 text-red-600 font-bold animate-in shake"><AlertCircle className="w-6 h-6 shrink-0" /><span>{error}</span></div>}
              <button onClick={handleGenerate} className="w-full py-8 bg-indigo-600 text-white font-black text-2xl rounded-[2.5rem] shadow-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-4 group uppercase tracking-widest">Start visualisering <Sparkles className="w-8 h-8 group-hover:rotate-12 transition-transform" /></button>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center py-24 md:py-40 space-y-12 animate-in fade-in">
            <div className="relative">
              <div className="w-32 h-32 md:w-48 md:h-48 border-[12px] border-slate-100 border-t-indigo-600 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center"><Box className="w-12 h-12 md:w-16 md:h-16 text-indigo-200" /></div>
            </div>
            <div className="text-center space-y-6">
              <h2 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tighter">Snekkeren tegner...</h2>
              <p className="text-slate-400 font-bold text-lg md:text-xl">Dette kan ta inntil 60 sekunder.</p>
            </div>
          </div>
        )}

        {step === 'results' && results && (
          <div className="space-y-12 md:space-y-20 animate-in fade-in pb-32 pt-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-slate-200 pb-12">
              <div className="space-y-3">
                <h2 className="text-4xl md:text-7xl font-black tracking-tighter text-slate-900 leading-[0.9]">Dine forslag</h2>
                <p className="text-slate-500 text-lg md:text-2xl font-medium">Trykk for å tilpasse ditt favorittdesign.</p>
              </div>
              {renderProgress && (
                <div className="bg-white px-8 py-5 rounded-[2rem] shadow-2xl border border-indigo-100 flex items-center gap-6 animate-in slide-in-from-right-10">
                  <span className="text-2xl font-black text-indigo-600">{renderProgress.current} / {renderProgress.total}</span>
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12">
              {results.design_proposals.map((proposal, idx) => (
                <div key={proposal.id} className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-slate-100 flex flex-col group hover:shadow-2xl transition-all duration-500 relative">
                  <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
                    {proposal.visual_image ? (
                      <>
                        <img src={proposal.visual_image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[2s] cursor-zoom-in" alt={`Variant ${idx+1}`} onClick={() => setSelectedImage(proposal.visual_image!)} />
                        <button onClick={() => setSelectedImage(proposal.visual_image!)} className="absolute bottom-6 right-6 bg-white/20 backdrop-blur-xl p-4 rounded-full opacity-0 group-hover:opacity-100 transition-all text-white hover:bg-white/40"><Maximize2 className="w-6 h-6" /></button>
                      </>
                    ) : variantErrors[proposal.id] ? (
                      <div className="h-full flex flex-col items-center justify-center p-10 text-center space-y-4 bg-slate-900">
                        <AlertCircle className="w-12 h-12 text-red-500" />
                        <div className="space-y-1">
                          <p className="text-white font-black text-lg">Tegningen feilet</p>
                          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{variantErrors[proposal.id]}</p>
                        </div>
                        <button onClick={() => generateSingleImage(proposal.id, proposal)} className="bg-white/10 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-white/20 transition-all"><RefreshCw className="w-4 h-4" /> Prøv på nytt</button>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-6 bg-slate-50 animate-pulse">
                        <Loader2 className="animate-spin w-12 h-12 text-indigo-200" />
                        <p className="text-[10px] font-black uppercase tracking-[0.3em]">Variant 0{idx+1}...</p>
                      </div>
                    )}
                    <div className="absolute top-6 left-6 z-10"><span className="bg-indigo-600 text-white px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-2xl">V{idx+1}</span></div>
                  </div>
                  <div className="p-8 md:p-10 flex flex-col flex-grow justify-between gap-8">
                    <div className="space-y-6">
                      <h3 className="font-black text-slate-900 uppercase tracking-tight text-xl">{proposal.style_package}</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Materiale</p><p className="text-sm font-bold text-slate-700 truncate">{proposal.fronts.material.replace('_', ' ')}</p></div>
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Farge</p><p className="text-sm font-bold text-slate-700 truncate">{proposal.fronts.color}</p></div>
                      </div>
                    </div>
                    <button onClick={() => { setSelectedProposalId(proposal.id); setStep('selected'); }} className="w-full py-5 bg-slate-900 hover:bg-indigo-600 text-white font-black text-sm rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl uppercase tracking-widest">Tilpass forslag <ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex flex-col items-center justify-center pt-24 border-t border-slate-200 gap-10">
               <button onClick={reset} className="text-slate-400 font-black hover:text-red-500 transition-colors uppercase tracking-[0.4em] text-[10px] px-12 py-6">Start helt på nytt</button>
            </div>
          </div>
        )}

        {step === 'selected' && selectedProposal && (
          <div className="max-w-4xl mx-auto space-y-12 animate-in zoom-in-95 pb-32">
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-center">Tilpasning</h2>
            <div className="bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col md:flex-row">
               <div className="relative w-full md:w-1/2 min-h-[400px] group overflow-hidden">
                 {selectedProposal.visual_image && <img src={selectedProposal.visual_image} className="w-full h-full object-cover cursor-zoom-in" onClick={() => setSelectedImage(selectedProposal.visual_image!)} alt="Valgt" />}
                 <button onClick={goBack} className="absolute top-8 left-8 bg-white/90 backdrop-blur-xl text-slate-800 px-6 py-4 rounded-full font-black text-xs flex items-center gap-2 shadow-2xl hover:bg-white transition-all uppercase tracking-widest z-10"><ChevronLeft className="w-4 h-4" /> Tilbake</button>
                 {isRefining === selectedProposal.id && (
                    <div className="absolute inset-0 bg-white/70 backdrop-blur-md flex flex-col items-center justify-center z-20 space-y-6">
                        <Loader2 className="w-16 h-16 text-indigo-600 animate-spin" />
                        <p className="font-black text-indigo-600 text-xs uppercase tracking-[0.3em]">Oppdaterer...</p>
                    </div>
                 )}
               </div>
               <div className="w-full md:w-1/2 p-10 md:p-14 space-y-12 bg-white flex flex-col justify-center">
                  <div className="space-y-4">
                    <div className="flex justify-between items-start gap-4">
                        <div className="space-y-1"><h3 className="text-4xl font-black uppercase tracking-tight text-slate-900">{selectedProposal.style_package}</h3><p className="text-indigo-600 font-black text-xs uppercase tracking-widest">Snekker AIndersen</p></div>
                    </div>
                  </div>
                  <div className="space-y-6">
                     <label className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-3 tracking-widest"><MessageSquare className="w-4 h-4" /> Endringer</label>
                     <textarea placeholder="Bytt farge til mørkegrå, legg til én dør..." className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] min-h-[160px] focus:border-indigo-500 outline-none resize-none font-medium shadow-inner leading-relaxed transition-all" value={selectedProposal.user_refinement || ''} onChange={(e) => { const newProposals = results!.design_proposals.map(p => p.id === selectedProposal.id ? { ...p, user_refinement: e.target.value } : p); setResults({ ...results!, design_proposals: newProposals }); }} />
                     <button onClick={() => handleRefine(selectedProposal.id)} disabled={isRefining === selectedProposal.id || !selectedProposal.user_refinement} className="w-full py-6 bg-indigo-600 text-white font-black text-lg rounded-[2.5rem] shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50">
                        <Sparkles className="w-6 h-6" /> Oppdater visualisering
                     </button>
                  </div>
                  <div className="pt-8 border-t border-slate-100">
                     <button onClick={() => setStep('report')} className="w-full py-8 bg-slate-900 text-white font-black text-2xl rounded-[2.5rem] shadow-2xl hover:bg-black transition-all flex items-center justify-center gap-4 group">
                        Ferdigstill rapport <FileText className="w-8 h-8 group-hover:scale-110 transition-transform" />
                     </button>
                  </div>
               </div>
            </div>
          </div>
        )}

        {step === 'report' && selectedProposal && (
          <div className="animate-in fade-in py-10 print:py-0 max-w-5xl mx-auto pb-32">
            <div className="flex flex-col md:flex-row justify-center gap-6 mb-16 print:hidden">
              <button onClick={handleDownloadPDF} disabled={isGeneratingPDF} className="bg-indigo-600 text-white px-12 py-6 rounded-[2.5rem] font-black text-xl flex items-center justify-center gap-4 shadow-2xl hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50">
                {isGeneratingPDF ? <Loader2 className="animate-spin w-8 h-8" /> : <Download className="w-8 h-8" />} Last ned PDF
              </button>
              <button onClick={() => window.print()} className="bg-slate-900 text-white px-12 py-6 rounded-[2.5rem] font-black text-xl flex items-center justify-center gap-4 shadow-2xl hover:bg-slate-800 transition-all active:scale-95">
                <Printer className="w-8 h-8" /> Skriv ut
              </button>
            </div>

            <div ref={reportRef} className="pdf-report-container space-y-0 print:space-y-0">
              <div className="report-page p-12 md:p-20 shadow-2xl border border-slate-100 flex flex-col justify-between mb-10 print:mb-0">
                <div className="space-y-16">
                  <header className="border-b-8 border-slate-900 pb-12 flex justify-between items-end">
                    <div className="space-y-8">
                      <div className="flex items-center gap-5"><div className="bg-slate-900 p-4 rounded-2xl shadow-xl"><Box className="text-white w-10 h-10" /></div><span className="font-black text-4xl tracking-tighter">Snekker AIndersen</span></div>
                      <h1 className="text-7xl font-black uppercase tracking-tighter leading-none mb-4 text-slate-900">Konstruksjons- <br />rapport</h1>
                    </div>
                  </header>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-16 avoid-break">
                    <div className="space-y-12">
                        <section className="space-y-6">
                          <h2 className="text-[11px] font-black uppercase text-indigo-600 border-b-2 border-indigo-50 pb-3 tracking-[0.2em]">Spesifikasjoner</h2>
                          <div className="grid grid-cols-2 gap-6">
                            <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Bredde</p><p className="font-black text-2xl text-slate-900">{inputs.width}mm</p></div>
                            <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Høyde</p><p className="font-black text-2xl text-slate-900">{inputs.height}mm</p></div>
                          </div>
                        </section>
                    </div>
                  </div>
                </div>
              </div>

              <div className="report-page p-12 md:p-20 shadow-2xl border border-slate-100 flex flex-col justify-between mb-10 print:mb-0 page-break">
                <div className="space-y-16">
                    <h2 className="text-[11px] font-black uppercase text-indigo-600 border-b-2 border-indigo-50 pb-4 tracking-[0.2em]">Endelig Visualisering</h2>
                    <div className="avoid-break">
                        <div className="relative overflow-hidden rounded-[3.5rem] shadow-2xl border-[12px] border-slate-50">
                            <img src={selectedProposal.visual_image} className="w-full h-auto max-h-[650px] object-cover" alt="Hovedvisualisering" />
                        </div>
                    </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}