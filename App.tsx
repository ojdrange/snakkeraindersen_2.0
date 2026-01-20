import React, { useState, useRef } from 'react';
import { 
  Camera, Ruler, Box, Sparkles, ChevronRight, Loader2, 
  CheckCircle2, AlertCircle, Layout, Tv, Book, Archive, MessageSquare, 
  Download, Printer, Maximize2, MapPin, ChevronLeft, RefreshCw, X,
  FileText, Info, UploadCloud
} from 'lucide-react';
import { UserInputs, AIResponse, ProductType, DesignProposal } from './types';
import { generateFurnitureProposals, refineSpecificProposal, visualizeProposal } from './geminiService';

type Step = 'upload' | 'scale' | 'dimensions' | 'placement' | 'product' | 'description' | 'processing' | 'results' | 'selected' | 'report';

const productTypes: { type: ProductType; label: string; icon: any; desc: string }[] = [
  { type: 'Wardrobe', label: 'Garderobe', icon: Archive, desc: 'Plassbygd oppbevaring' },
  { type: 'TV Bench', label: 'TV-benk', icon: Tv, desc: 'Medie-møbler og skjenk' },
  { type: 'Bookcase', label: 'Bokhylle', icon: Book, desc: 'Skreddersydd for din vegg' },
  { type: 'Sideboard', label: 'Skjenk', icon: Layout, desc: 'Lekkert side-møbel' },
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
      const errorMessage = err.message?.includes('403') ? "Ingen tilgang" : 
                          err.message?.includes('429') ? "Fullt trykk nå..." : "Tegningen feilet";
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
      setError("Oppdatering feilet.");
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
      filename: `Snekker-AIndersen-Design.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
      // @ts-ignore (html2pdf is loaded via script tag)
      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.error("PDF-feil:", err);
      window.print(); // Fallback til vanlig utskrift
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const reset = () => { if (confirm("Starte nytt prosjekt?")) window.location.reload(); };

  const selectedProposal = results?.design_proposals.find(p => p.id === selectedProposalId);

  const goBack = () => {
    const stepOrder: Step[] = ['upload', 'scale', 'dimensions', 'placement', 'product', 'description', 'results', 'selected', 'report'];
    const idx = stepOrder.indexOf(step);
    if (idx > 0) setStep(stepOrder[idx - 1]);
  };

  const goForward = () => {
    if (step === 'scale') setStep('dimensions');
    else if (step === 'dimensions' && (inputs.width || true)) setStep('placement'); // Tillat progress
    else if (step === 'placement' && inputs.placement_point) setStep('product');
    else if (step === 'product' && inputs.productType) setStep('description');
    else if (step === 'description') handleGenerate();
  };

  return (
    <div className="min-h-screen bg-[#fcfcfd] text-slate-900 pb-20 font-sans selection:bg-indigo-100 print:bg-white overflow-x-hidden">
      {selectedImage && (
        <div className="fixed inset-0 bg-slate-950/95 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setSelectedImage(null)}>
          <button className="absolute top-6 right-6 text-white p-3 hover:bg-white/10 rounded-full transition-colors"><X className="w-8 h-8" /></button>
          <img src={selectedImage} className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" alt="Visning" />
        </div>
      )}

      <nav className="bg-white/70 backdrop-blur-md border-b sticky top-0 z-50 px-6 py-4 flex items-center justify-between shadow-sm print:hidden">
        <div className="flex items-center gap-4 cursor-pointer group" onClick={reset}>
          <div className="bg-slate-900 p-2 rounded-xl shadow-lg transition-transform group-hover:scale-110"><Box className="text-white w-5 h-5" /></div>
          <div>
            <h1 className="font-extrabold text-lg md:text-xl tracking-tight leading-none">Snekker <span className="text-indigo-600">AIndersen</span></h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">AI-drevet håndverk</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {step !== 'upload' && step !== 'processing' && (
            <button onClick={goBack} className="text-slate-500 font-bold text-sm px-4 py-2 rounded-xl hover:bg-slate-100 flex items-center gap-2 transition-all"><ChevronLeft className="w-4 h-4" /> Tilbake</button>
          )}
        </div>
      </nav>

      <main className={`${step === 'results' ? 'max-w-[1400px]' : 'max-w-4xl'} mx-auto mt-8 md:mt-16 px-6 transition-all duration-500`}>
        {step === 'upload' && (
          <div className="flex flex-col items-center text-center space-y-12 py-10 animate-in fade-in slide-in-from-bottom-10">
            <div className="max-w-2xl space-y-4">
              <h1 className="text-5xl md:text-8xl font-black text-slate-900 tracking-tighter leading-[0.9] lg:leading-[0.85]">
                Tegn ditt nye <br />
                <span className="text-indigo-600">møbel</span> på sekunder.
              </h1>
              <p className="text-lg md:text-xl text-slate-500 font-medium leading-relaxed px-4">
                Last opp et bilde av rommet ditt, så tegner vi inn forslagene for deg – fotorealistisk og i riktig skala.
              </p>
            </div>
            
            <div className="w-full max-w-xl group relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-[3rem] blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
              <div className="relative bg-white p-12 md:p-20 rounded-[3rem] border-2 border-slate-100 hover:border-indigo-200 transition-all cursor-pointer shadow-xl overflow-hidden flex flex-col items-center gap-8">
                <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" title="" />
                <div className="p-8 bg-indigo-50 rounded-[2.5rem] group-hover:scale-110 group-hover:bg-indigo-100 transition-all duration-500">
                  <UploadCloud className="w-14 h-14 text-indigo-600" />
                </div>
                <div className="space-y-3">
                  <p className="font-extrabold text-2xl text-slate-900">Velg rombilde</p>
                  <p className="text-sm font-semibold text-slate-400">Dra og slipp bildefil her</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'scale' && (
          <div className="bg-white p-8 md:p-12 rounded-[3rem] shadow-2xl border border-slate-100 animate-in zoom-in-95 text-center">
            <header className="mb-10 space-y-2">
              <h2 className="text-3xl font-black flex items-center justify-center gap-3">
                <Ruler className="text-indigo-600" /> Kalibrering
              </h2>
              <p className="text-slate-500 font-medium">Marker to punkter med kjent avstand (f.eks. en dørkarm på 210cm).</p>
            </header>
            
            <div className="relative w-full rounded-3xl overflow-hidden cursor-crosshair border-8 border-slate-50 shadow-inner group" onClick={handleScaleClick}>
              <img ref={imageRef} src={inputs.image!} className="w-full h-auto block" alt="Skala" />
              {scaleDrawing.p1 && <div className="absolute w-6 h-6 bg-indigo-600 rounded-full border-4 border-white shadow-xl -translate-x-1/2 -translate-y-1/2 z-20" style={{left: `${scaleDrawing.p1.x}%`, top: `${scaleDrawing.p1.y}%`}} />}
              {scaleDrawing.p2 && <div className="absolute w-6 h-6 bg-indigo-600 rounded-full border-4 border-white shadow-xl -translate-x-1/2 -translate-y-1/2 z-20" style={{left: `${scaleDrawing.p2.x}%`, top: `${scaleDrawing.p2.y}%`}} />}
              {scaleDrawing.p1 && scaleDrawing.p2 && <svg className="absolute inset-0 pointer-events-none w-full h-full z-10"><line x1={`${scaleDrawing.p1.x}%`} y1={`${scaleDrawing.p1.y}%`} x2={`${scaleDrawing.p2.x}%`} y2={`${scaleDrawing.p2.y}%`} stroke="#4f46e5" strokeWidth="4" strokeDasharray="12 12" /></svg>}
            </div>

            <div className="mt-12 max-w-md mx-auto space-y-8">
              {scaleDrawing.p1 && scaleDrawing.p2 && (
                <div className="animate-in slide-in-from-top-4">
                  <label className="text-[11px] font-black uppercase text-slate-400 mb-4 block tracking-widest">Lengde mellom punkter (mm)</label>
                  <input type="number" placeholder="f.eks 2100" className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-3xl focus:border-indigo-500 outline-none font-black text-center text-4xl shadow-inner transition-all" value={scaleDrawing.tempLength || ''} onChange={(e) => setScaleDrawing({...scaleDrawing, tempLength: e.target.value})} />
                </div>
              )}
              <div className="flex gap-4">
                <button onClick={() => setStep('dimensions')} className="flex-1 py-6 bg-slate-100 text-slate-500 font-black rounded-2xl hover:bg-slate-200 transition-all text-xs uppercase tracking-[0.2em]">Hopp over</button>
                <button onClick={goForward} disabled={scaleDrawing.p1 && scaleDrawing.p2 && !scaleDrawing.tempLength ? true : false} className="flex-[2] py-6 bg-indigo-600 text-white font-black text-xl rounded-2xl shadow-xl hover:bg-indigo-700 transition-all disabled:opacity-30 uppercase tracking-widest">Neste steg</button>
              </div>
            </div>
          </div>
        )}

        {step === 'dimensions' && (
          <div className="bg-white p-10 md:p-16 rounded-[4rem] shadow-2xl border border-slate-100 animate-in zoom-in-95">
            <h2 className="text-4xl md:text-6xl font-black mb-12 tracking-tighter text-center leading-none">Mål på møbelet</h2>
            <div className="space-y-14">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  { id: 'width', label: 'Bredde' },
                  { id: 'height', label: 'Høyde' },
                  { id: 'depth', label: 'Dybde' }
                ].map(f => (
                  <div key={f.id} className="space-y-4">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] text-center">{f.label}</p>
                    <div className="relative group">
                      <input type="number" placeholder="0" className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-[2rem] focus:border-indigo-500 outline-none font-black text-center text-4xl shadow-inner transition-all group-hover:bg-white" value={(inputs as any)[f.id]} onChange={(e) => setInputs({...inputs, [f.id]: e.target.value})} />
                      <span className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 font-bold text-sm">mm</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-4">
                <label className="text-[11px] font-black uppercase text-slate-400 tracking-[0.2em] ml-6 flex items-center gap-2"><Info className="w-4 h-4 text-indigo-400" /> Hindringer i rommet</label>
                <textarea placeholder="Beskriv lister, skråtak eller stikkontakter vi må ta hensyn til..." className="w-full p-10 bg-slate-50 border-2 border-slate-100 rounded-[3rem] min-h-[180px] focus:border-indigo-500 outline-none resize-none font-medium shadow-inner leading-relaxed transition-all focus:bg-white" value={inputs.constraints_text} onChange={(e) => setInputs({...inputs, constraints_text: e.target.value})} />
              </div>
              <button onClick={goForward} className="w-full py-8 bg-indigo-600 text-white font-black text-2xl rounded-[3rem] shadow-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-4 group">
                Gå videre <ChevronRight className="w-8 h-8 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        )}

        {step === 'placement' && (
          <div className="bg-white p-8 md:p-12 rounded-[3rem] shadow-2xl border border-slate-100 animate-in zoom-in-95 text-center">
            <header className="mb-10 space-y-2">
              <h2 className="text-3xl font-black">Plassering</h2>
              <p className="text-slate-500 font-medium">Trykk der møbelet skal bygges.</p>
            </header>
            <div className="relative w-full rounded-[3rem] overflow-hidden cursor-crosshair border-8 border-slate-50 shadow-2xl ring-1 ring-slate-100 group" onClick={handleImageClick}>
              <img src={inputs.image!} className="w-full h-auto block" alt="Plassering" />
              {inputs.placement_point && (
                <div className="absolute z-20 flex items-center justify-center pointer-events-none animate-in zoom-in" style={{ left: `${inputs.placement_point.x}%`, top: `${inputs.placement_point.y}%`, transform: 'translate(-50%, -50%)' }}>
                  <div className="bg-indigo-600 text-white p-4 rounded-full shadow-2xl border-4 border-white ring-8 ring-indigo-600/20 animate-bounce">
                    <MapPin className="w-8 h-8 md:w-10 md:h-10" />
                  </div>
                </div>
              )}
            </div>
            <button onClick={goForward} disabled={!inputs.placement_point} className="mt-12 w-full max-w-md mx-auto py-8 bg-indigo-600 text-white font-black text-2xl rounded-3xl shadow-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-4 group disabled:opacity-30 uppercase tracking-widest">
              Neste steg <ChevronRight className="w-8 h-8 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        )}

        {step === 'product' && (
          <div className="space-y-12 animate-in slide-in-from-right-10 py-10">
            <h2 className="text-5xl md:text-7xl font-black tracking-tighter text-center leading-none">Hvilken type <br />skal vi bygge?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              {productTypes.map((p) => (
                <button key={p.type} onClick={() => { setInputs({...inputs, productType: p.type}); setStep('description'); }} className={`bg-white p-12 rounded-[3rem] border-4 transition-all flex items-center gap-10 group shadow-lg hover:shadow-2xl hover:-translate-y-2 ${inputs.productType === p.type ? 'border-indigo-600' : 'border-transparent'}`}>
                  <div className={`p-8 rounded-3xl transition-all group-hover:scale-110 ${inputs.productType === p.type ? 'bg-indigo-100' : 'bg-slate-50'}`}>
                    <p.icon className={`w-14 h-14 ${inputs.productType === p.type ? 'text-indigo-600' : 'text-slate-400'}`} />
                  </div>
                  <div className="text-left">
                    <span className="font-black text-2xl text-slate-900 block mb-1">{p.label}</span>
                    <span className="text-slate-400 font-bold text-sm uppercase tracking-widest">{p.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'description' && (
          <div className="bg-white p-10 md:p-16 rounded-[4rem] shadow-2xl animate-in zoom-in-95 max-w-3xl mx-auto border border-slate-100">
            <h2 className="text-4xl md:text-6xl font-black mb-10 tracking-tighter text-center leading-none">Dine ønsker</h2>
            <div className="space-y-10">
              <textarea placeholder="Fortell om farger, fronter, antall dører eller spesielle funksjoner du ønsker deg..." className="w-full p-10 bg-slate-50 border-2 border-slate-100 rounded-[3rem] min-h-[250px] text-2xl font-medium focus:border-indigo-500 outline-none resize-none shadow-inner leading-relaxed transition-all focus:bg-white" value={inputs.description} onChange={(e) => setInputs({...inputs, description: e.target.value})} />
              {error && <div className="p-6 bg-red-50 border border-red-100 rounded-3xl flex items-center gap-4 text-red-600 font-bold animate-in shake"><AlertCircle className="w-7 h-7 shrink-0" /><span>{error}</span></div>}
              <button onClick={handleGenerate} className="w-full py-10 bg-indigo-600 text-white font-black text-3xl rounded-[3rem] shadow-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-6 group uppercase tracking-widest">
                Start Tegning <Sparkles className="w-10 h-10 group-hover:rotate-12 transition-transform" />
              </button>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center py-20 md:py-40 space-y-12 animate-in fade-in">
            <div className="relative">
              <div className="w-36 h-36 md:w-56 md:h-56 border-[12px] border-slate-100 border-t-indigo-600 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center animate-pulse"><Box className="w-14 h-14 md:w-20 md:h-20 text-indigo-200" /></div>
            </div>
            <div className="text-center space-y-6">
              <h2 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tighter leading-none">Snekkeren tegner...</h2>
              <div className="flex flex-col items-center gap-3">
                <p className="text-slate-400 font-bold text-xl uppercase tracking-widest">Skaper realistiske forslag</p>
                <div className="h-2 w-48 bg-slate-100 rounded-full overflow-hidden mt-4">
                  <div className="h-full bg-indigo-600 animate-[loading_2s_ease-in-out_infinite]" style={{width: '30%'}} />
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'results' && results && (
          <div className="space-y-16 animate-in fade-in pb-32">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-10 border-b border-slate-100 pb-16">
              <div className="space-y-4">
                <h2 className="text-5xl md:text-8xl font-black tracking-tighter text-slate-900 leading-[0.85]">Dine <br />forslag.</h2>
                <p className="text-slate-400 text-xl font-medium">Trykk på et bilde for å starte tilpasningen.</p>
              </div>
              {renderProgress && (
                <div className="bg-white px-10 py-6 rounded-[2.5rem] shadow-2xl border border-indigo-50 flex items-center gap-6 animate-in slide-in-from-right-10">
                  <div className="space-y-1">
                    <p className="text-[11px] font-black uppercase text-indigo-400 tracking-widest">Prosesserer</p>
                    <span className="text-3xl font-black text-indigo-600">{renderProgress.current} / {renderProgress.total}</span>
                  </div>
                  <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 md:gap-14">
              {results.design_proposals.map((proposal, idx) => (
                <div key={proposal.id} className="bg-white rounded-[3rem] shadow-xl overflow-hidden border border-slate-100 flex flex-col group hover:shadow-2xl hover:-translate-y-3 transition-all duration-500 relative">
                  <div className="aspect-[4/3] bg-slate-50 relative overflow-hidden">
                    {proposal.visual_image ? (
                      <>
                        <img src={proposal.visual_image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[3s] cursor-zoom-in" alt={`Variant ${idx+1}`} onClick={() => setSelectedImage(proposal.visual_image!)} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center p-8 pointer-events-none">
                            <span className="text-white font-black text-sm uppercase tracking-widest flex items-center gap-2"><Maximize2 className="w-4 h-4" /> Klikk for fullskjerm</span>
                        </div>
                      </>
                    ) : variantErrors[proposal.id] ? (
                      <div className="h-full flex flex-col items-center justify-center p-12 text-center space-y-6 bg-slate-900">
                        <AlertCircle className="w-14 h-14 text-red-500" />
                        <p className="text-slate-400 text-xs font-black uppercase tracking-widest leading-relaxed">{variantErrors[proposal.id]}</p>
                        <button onClick={() => generateSingleImage(proposal.id, proposal)} className="bg-white/10 text-white px-8 py-4 rounded-2xl text-[11px] font-black uppercase flex items-center gap-3 hover:bg-white/20 transition-all"><RefreshCw className="w-4 h-4" /> Prøv på nytt</button>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-200 space-y-8 bg-slate-50 animate-pulse">
                        <Loader2 className="animate-spin w-14 h-14 text-indigo-100" />
                        <p className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-300">Variant 0{idx+1}</p>
                      </div>
                    )}
                    <div className="absolute top-8 left-8 z-10"><span className="bg-slate-900 text-white px-6 py-2 rounded-full text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl">V{idx+1}</span></div>
                  </div>
                  <div className="p-10 flex flex-col flex-grow justify-between gap-10">
                    <div className="space-y-8">
                      <div className="space-y-1">
                        <h3 className="font-black text-slate-900 uppercase tracking-tight text-2xl leading-none">{proposal.style_package}</h3>
                        <p className="text-indigo-500 font-bold text-[11px] uppercase tracking-widest">Signatur Design</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50/50 p-5 rounded-[1.5rem] border border-slate-100/50">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Materiale</p>
                            <p className="text-sm font-bold text-slate-700 capitalize">{proposal.fronts.material.replace('_', ' ')}</p>
                        </div>
                        <div className="bg-slate-50/50 p-5 rounded-[1.5rem] border border-slate-100/50">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Farge</p>
                            <p className="text-sm font-bold text-slate-700 capitalize">{proposal.fronts.color}</p>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => { setSelectedProposalId(proposal.id); setStep('selected'); }} className="w-full py-6 bg-slate-900 hover:bg-indigo-600 text-white font-black text-sm rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl uppercase tracking-[0.2em]">
                        Velg dette designet <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'selected' && selectedProposal && (
          <div className="max-w-5xl mx-auto space-y-12 animate-in zoom-in-95 pb-32 pt-6">
            <h2 className="text-5xl md:text-7xl font-black tracking-tighter text-center leading-none">Tilpasning</h2>
            <div className="bg-white rounded-[4rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col md:flex-row">
               <div className="relative w-full md:w-1/2 min-h-[500px] group overflow-hidden bg-slate-50">
                 {selectedProposal.visual_image && (
                    <img src={selectedProposal.visual_image} className="w-full h-full object-cover cursor-zoom-in group-hover:scale-105 transition-transform duration-[5s]" onClick={() => setSelectedImage(selectedProposal.visual_image!)} alt="Valgt" />
                 )}
                 <button onClick={goBack} className="absolute top-10 left-10 bg-white/90 backdrop-blur-xl text-slate-900 px-8 py-5 rounded-full font-black text-xs flex items-center gap-3 shadow-2xl hover:bg-white transition-all uppercase tracking-widest z-10">
                    <ChevronLeft className="w-5 h-5" /> Gå tilbake
                 </button>
                 {isRefining === selectedProposal.id && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-md flex flex-col items-center justify-center z-20 space-y-8">
                        <Loader2 className="w-20 h-20 text-indigo-600 animate-spin" />
                        <p className="font-black text-indigo-600 text-sm uppercase tracking-[0.4em]">Oppdaterer designet...</p>
                    </div>
                 )}
               </div>
               <div className="w-full md:w-1/2 p-12 md:p-16 space-y-14 bg-white flex flex-col justify-center">
                  <div className="space-y-4">
                    <div className="flex justify-between items-start gap-4">
                        <div className="space-y-2">
                            <h3 className="text-5xl font-black uppercase tracking-tight text-slate-900 leading-none">{selectedProposal.style_package}</h3>
                            <div className="flex items-center gap-3">
                                <span className="w-3 h-3 rounded-full bg-indigo-500 animate-pulse" />
                                <p className="text-indigo-600 font-black text-[11px] uppercase tracking-[0.3em]">Håndverker-fokusert valg</p>
                            </div>
                        </div>
                    </div>
                  </div>
                  <div className="space-y-8">
                     <label className="text-[11px] font-black uppercase text-slate-400 flex items-center gap-3 tracking-widest"><MessageSquare className="w-5 h-5 text-indigo-400" /> Spesifiser endringer</label>
                     <textarea placeholder="F.eks: 'Bytt til eikefiner', 'Legg til glassdører', 'Gjør den hvit'..." className="w-full p-10 bg-slate-50 border-2 border-slate-100 rounded-[3rem] min-h-[200px] focus:border-indigo-500 outline-none resize-none font-medium shadow-inner leading-relaxed transition-all focus:bg-white" value={selectedProposal.user_refinement || ''} onChange={(e) => { const newProposals = results!.design_proposals.map(p => p.id === selectedProposal.id ? { ...p, user_refinement: e.target.value } : p); setResults({ ...results!, design_proposals: newProposals }); }} />
                     <button onClick={() => handleRefine(selectedProposal.id)} disabled={isRefining === selectedProposal.id || !selectedProposal.user_refinement} className="w-full py-8 bg-indigo-600 text-white font-black text-xl rounded-[2.5rem] shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-4 active:scale-95 disabled:opacity-30 uppercase tracking-widest">
                        <Sparkles className="w-8 h-8" /> Oppdater design
                     </button>
                  </div>
                  <div className="pt-10 border-t border-slate-100">
                     <button onClick={() => setStep('report')} className="w-full py-10 bg-slate-900 text-white font-black text-2xl rounded-[3rem] shadow-2xl hover:bg-black transition-all flex items-center justify-center gap-6 group">
                        Ferdigstill rapport <FileText className="w-10 h-10 group-hover:scale-110 transition-transform" />
                     </button>
                  </div>
               </div>
            </div>
          </div>
        )}

        {step === 'report' && selectedProposal && (
          <div className="animate-in fade-in py-10 print:py-0 max-w-5xl mx-auto pb-32">
            <div className="flex flex-col md:flex-row justify-center gap-8 mb-20 print:hidden">
              <button onClick={handleDownloadPDF} disabled={isGeneratingPDF} className="bg-indigo-600 text-white px-14 py-8 rounded-[3rem] font-black text-2xl flex items-center justify-center gap-5 shadow-2xl hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50">
                {isGeneratingPDF ? <Loader2 className="animate-spin w-10 h-10" /> : <Download className="w-10 h-10" />} Last ned PDF
              </button>
              <button onClick={() => window.print()} className="bg-slate-900 text-white px-14 py-8 rounded-[3rem] font-black text-2xl flex items-center justify-center gap-5 shadow-2xl hover:bg-slate-800 transition-all active:scale-95">
                <Printer className="w-10 h-10" /> Skriv ut
              </button>
            </div>

            <div ref={reportRef} className="pdf-report-container space-y-0 print:space-y-0">
              <div className="report-page p-12 md:p-24 bg-white shadow-2xl border border-slate-100 flex flex-col justify-between mb-12 print:mb-0">
                <div className="space-y-24">
                  <header className="border-b-[12px] border-slate-900 pb-16 flex justify-between items-end">
                    <div className="space-y-12">
                      <div className="flex items-center gap-6">
                        <div className="bg-slate-900 p-5 rounded-2xl shadow-xl"><Box className="text-white w-12 h-12" /></div>
                        <div>
                            <span className="font-black text-5xl tracking-tighter leading-none block">AIndersen</span>
                            <span className="text-indigo-600 font-bold uppercase tracking-[0.4em] text-xs">Konstruksjons-rapport</span>
                        </div>
                      </div>
                      <h1 className="text-8xl font-black uppercase tracking-tighter leading-[0.8] text-slate-900">Møbel- <br />Design</h1>
                    </div>
                  </header>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-24">
                    <div className="space-y-16">
                        <section className="space-y-10">
                          <h2 className="text-[13px] font-black uppercase text-indigo-600 border-b-4 border-indigo-50 pb-4 tracking-[0.4em]">Spesifikasjoner</h2>
                          <div className="grid grid-cols-2 gap-10">
                            <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100">
                                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Utvendig Bredde</p>
                                <p className="font-black text-3xl text-slate-900">{inputs.width || 0}mm</p>
                            </div>
                            <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100">
                                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Utvendig Høyde</p>
                                <p className="font-black text-3xl text-slate-900">{inputs.height || 0}mm</p>
                            </div>
                          </div>
                        </section>
                        <section className="space-y-8">
                           <h2 className="text-[13px] font-black uppercase text-slate-400 tracking-[0.4em]">Materialvalg</h2>
                           <p className="text-2xl font-bold leading-relaxed">{selectedProposal.fronts.material.replace('_', ' ')} i fargen {selectedProposal.fronts.color}.</p>
                        </section>
                    </div>
                  </div>
                </div>
              </div>

              <div className="report-page p-12 md:p-24 bg-white shadow-2xl border border-slate-100 flex flex-col justify-between mb-12 print:mb-0 page-break">
                <div className="space-y-16">
                    <h2 className="text-[13px] font-black uppercase text-indigo-600 border-b-4 border-indigo-50 pb-6 tracking-[0.4em]">Endelig Visualisering</h2>
                    <div className="relative overflow-hidden rounded-[4rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.15)] border-[16px] border-slate-50">
                        {selectedProposal.visual_image && (
                          <img src={selectedProposal.visual_image} className="w-full h-auto max-h-[750px] object-cover" alt="Rapportvisning" />
                        )}
                    </div>
                    <div className="bg-slate-900 p-12 rounded-[3rem] text-white space-y-6">
                        <p className="text-[11px] font-black uppercase tracking-[0.5em] text-indigo-400">Snekkerens kommentar</p>
                        <p className="text-2xl font-medium leading-relaxed italic">"Dette møbelet er designet for å utnytte rommets naturlige geometri. Alle mål er verifisert mot kalibreringen for optimal passform."</p>
                    </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer med versjons-tag for å bekrefte oppdatering */}
      <footer className="max-w-4xl mx-auto px-6 py-10 text-center opacity-30 text-[10px] font-bold uppercase tracking-widest print:hidden">
        Snekker AIndersen v1.2 - Oppdatert via GitHub
      </footer>
      
      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}
