import React, { useState, useRef } from 'react';
import { 
  Camera, Ruler, Box, Sparkles, ChevronRight, Loader2, 
  CheckCircle2, AlertCircle, Layout, Tv, Book, Archive, MessageSquare, 
  Download, Printer, Maximize2, MapPin, ChevronLeft, RefreshCw, X,
  ClipboardList, Layers
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
    } catch (err) {
      setVariantErrors(prev => ({ ...prev, [proposalId]: "Tegnefeil" }));
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
        margin: 0,
        filename: 'AIndersen-Rapport.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all'] }
      };
      // @ts-ignore
      await html2pdf().set(opt).from(reportRef.current).save();
    } catch (err) {
      window.print();
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const reset = () => { if (confirm("Starte på nytt?")) window.location.reload(); };

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
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 font-sans print:bg-white">
      {selectedImage && (
        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4" onClick={() => setSelectedImage(null)}>
          <button className="absolute top-6 right-6 text-white p-2"><X className="w-8 h-8" /></button>
          <img src={selectedImage} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" alt="Fullvisning" />
        </div>
      )}

      <nav className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-50 px-4 py-4 flex items-center justify-between shadow-sm print:hidden">
        <div className="flex items-center gap-3 cursor-pointer" onClick={reset}>
          <div className="bg-indigo-600 p-2 rounded-xl shadow-lg"><Box className="text-white w-5 h-5" /></div>
          <span className="font-extrabold text-xl tracking-tight">Snekker <span className="text-indigo-600">AIndersen</span></span>
        </div>
        {step !== 'upload' && step !== 'processing' && (
          <button onClick={goBack} className="text-slate-500 font-bold text-sm px-4 py-2 rounded-xl flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> Tilbake</button>
        )}
      </nav>

      <main className={`${step === 'results' ? 'max-w-[1400px]' : 'max-w-3xl'} mx-auto mt-8 px-4 transition-all duration-700`}>
        {step === 'upload' && (
          <div className="flex flex-col items-center text-center space-y-12 py-16 animate-in fade-in slide-in-from-bottom-8">
            <div className="space-y-4">
              <h1 className="text-5xl md:text-7xl font-black text-slate-900 tracking-tighter leading-none">Konstruer ditt <br /><span className="text-indigo-600 italic underline decoration-indigo-200 underline-offset-8">perfekte møbel</span></h1>
              <p className="text-xl text-slate-500 max-w-lg mx-auto font-medium">Last opp bilde av nisjen eller veggen.</p>
            </div>
            <div className="w-full max-w-md bg-white p-16 rounded-[3rem] border-4 border-dashed border-slate-200 hover:border-indigo-400 group relative cursor-pointer shadow-xl transition-all overflow-hidden">
              <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
              <div className="flex flex-col items-center gap-8">
                <div className="p-8 bg-indigo-50 rounded-[2.5rem] group-hover:scale-110 transition-all"><Camera className="w-16 h-16 text-indigo-600" /></div>
                <div className="space-y-2"><p className="font-black text-2xl text-slate-800">Velg bilde</p><p className="text-sm font-semibold text-slate-400">Trykk her for å starte</p></div>
              </div>
            </div>
          </div>
        )}

        {step === 'scale' && (
          <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-2xl border border-slate-100 animate-in zoom-in-95 text-center">
            <h2 className="text-3xl font-black mb-6 flex items-center justify-center gap-3"><Ruler className="text-indigo-600" /> Kalibrering</h2>
            <p className="text-slate-500 mb-8 font-medium">Marker to punkter med kjent avstand (f.eks dørkarm).</p>
            <div className="relative w-full max-w-2xl mx-auto rounded-[1.5rem] overflow-hidden cursor-crosshair border-4 border-slate-50 shadow-inner group" onClick={handleScaleClick}>
              <img ref={imageRef} src={inputs.image!} className="w-full block" alt="Skala" />
              {scaleDrawing.p1 && <div className="absolute w-4 h-4 bg-indigo-600 rounded-full border-2 border-white shadow-xl -translate-x-1/2 -translate-y-1/2 z-20" style={{left: `${scaleDrawing.p1.x}%`, top: `${scaleDrawing.p1.y}%`}} />}
              {scaleDrawing.p2 && <div className="absolute w-4 h-4 bg-indigo-600 rounded-full border-2 border-white shadow-xl -translate-x-1/2 -translate-y-1/2 z-20" style={{left: `${scaleDrawing.p2.x}%`, top: `${scaleDrawing.p2.y}%`}} />}
              {scaleDrawing.p1 && scaleDrawing.p2 && <svg className="absolute inset-0 pointer-events-none w-full h-full z-10"><line x1={`${scaleDrawing.p1.x}%`} y1={`${scaleDrawing.p1.y}%`} x2={`${scaleDrawing.p2.x}%`} y2={`${scaleDrawing.p2.y}%`} stroke="#4f46e5" strokeWidth="4" strokeDasharray="10 5" /></svg>}
            </div>
            <div className="mt-8 max-w-sm mx-auto space-y-4">
              {scaleDrawing.p1 && scaleDrawing.p2 && (
                <div className="animate-in slide-in-from-top-4">
                  <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Mål i millimeter</label>
                  <input type="number" placeholder="2100" className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] focus:border-indigo-500 outline-none font-black text-center text-3xl shadow-inner" value={scaleDrawing.tempLength || ''} onChange={(e) => setScaleDrawing({...scaleDrawing, tempLength: e.target.value})} />
                </div>
              )}
              <div className="flex gap-4">
                <button onClick={() => setStep('dimensions')} className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl hover:bg-slate-200 transition-all text-sm">Hopp over</button>
                <button onClick={goForward} disabled={scaleDrawing.p1 && scaleDrawing.p2 && !scaleDrawing.tempLength ? true : false} className="flex-[2] py-4 bg-indigo-600 text-white font-black text-xl rounded-2xl shadow-xl hover:bg-indigo-700 transition-all">Neste</button>
              </div>
            </div>
          </div>
        )}

        {step === 'dimensions' && (
          <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-2xl border border-slate-100 animate-in zoom-in-95">
            <h2 className="text-4xl font-black mb-10 tracking-tight text-center">Hva er målene?</h2>
            <div className="space-y-10">
              <div className="grid grid-cols-3 gap-6">
                {['width', 'height', 'depth'].map(f => (
                  <div key={f} className="space-y-3 text-center">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{f === 'width' ? 'Bredde' : f === 'height' ? 'Høyde' : 'Dybde'}</p>
                    <input type="number" placeholder="mm" className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none font-black text-center text-xl shadow-inner" value={(inputs as any)[f]} onChange={(e) => setInputs({...inputs, [f]: e.target.value})} />
                  </div>
                ))}
              </div>
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Hindringer (lister, stikkontakter, skråtak)</label>
                <textarea placeholder="Nevn detaljer her..." className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl min-h-[120px] focus:border-indigo-500 outline-none resize-none font-medium shadow-inner" value={inputs.constraints_text} onChange={(e) => setInputs({...inputs, constraints_text: e.target.value})} />
              </div>
              <button onClick={goForward} disabled={!inputs.width || !inputs.height || !inputs.depth} className="w-full py-6 bg-indigo-600 text-white font-black text-2xl rounded-3xl shadow-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-4">Fortsett <ChevronRight className="w-8 h-8" /></button>
            </div>
          </div>
        )}

        {step === 'placement' && (
          <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-2xl border border-slate-100 animate-in zoom-in-95 text-center">
            <h2 className="text-4xl font-black mb-4">Plassering</h2>
            <p className="text-slate-500 mb-8 font-medium">Trykk der møbelets baksiden skal treffe veggen.</p>
            <div className="relative w-full max-w-2xl mx-auto rounded-[2rem] overflow-hidden cursor-crosshair border-8 border-slate-50 shadow-inner ring-1 ring-slate-200" onClick={handleImageClick}>
              <img src={inputs.image!} className="w-full block" alt="Plassering" />
              {inputs.placement_point && <div className="absolute z-20 flex items-center justify-center pointer-events-none" style={{ left: `${inputs.placement_point.x}%`, top: `${inputs.placement_point.y}%`, transform: 'translate(-50%, -50%)' }}><div className="bg-indigo-600 text-white p-4 rounded-full shadow-2xl border-4 border-white animate-bounce"><MapPin className="w-10 h-10" /></div></div>}
            </div>
            <button onClick={goForward} disabled={!inputs.placement_point} className="mt-10 w-full max-w-md mx-auto py-6 bg-indigo-600 text-white font-black text-2xl rounded-3xl shadow-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-4">Dette er plassen <ChevronRight className="w-8 h-8" /></button>
          </div>
        )}

        {step === 'product' && (
          <div className="space-y-12 animate-in slide-in-from-right-8">
            <h2 className="text-5xl font-black tracking-tighter text-center">Velg type</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {productTypes.map((p) => (
                <button key={p.type} onClick={() => { setInputs({...inputs, productType: p.type}); setStep('description'); }} className={`bg-white p-10 rounded-[2.5rem] border-4 transition-all flex flex-col items-center gap-6 group shadow-lg hover:shadow-2xl ${inputs.productType === p.type ? 'border-indigo-600 scale-105' : 'border-transparent'}`}>
                  <div className={`p-8 rounded-[2rem] transition-all ${inputs.productType === p.type ? 'bg-indigo-100' : 'bg-slate-50'}`}><p.icon className={`w-14 h-14 ${inputs.productType === p.type ? 'text-indigo-600' : 'text-slate-400'}`} /></div>
                  <span className="font-black text-xl text-slate-800 tracking-tight text-center">{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'description' && (
          <div className="bg-white p-10 md:p-16 rounded-[3rem] shadow-2xl animate-in zoom-in-95 max-w-2xl mx-auto border border-slate-100">
            <h2 className="text-4xl font-black mb-6 tracking-tight text-center">Dine ønsker</h2>
            <textarea placeholder="Antall dører, farger, materialer..." className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] min-h-[200px] text-xl font-medium focus:border-indigo-500 outline-none resize-none shadow-inner leading-relaxed" value={inputs.description} onChange={(e) => setInputs({...inputs, description: e.target.value})} />
            {error && <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 font-bold"><AlertCircle className="w-6 h-6 shrink-0" /><span>{error}</span></div>}
            <button onClick={handleGenerate} className="mt-8 w-full py-8 bg-indigo-600 text-white font-black text-2xl rounded-[2.5rem] shadow-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-4">Start visualisering <Sparkles className="w-8 h-8" /></button>
          </div>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center py-32 space-y-10 animate-in fade-in">
            <div className="relative"><Loader2 className="w-32 h-32 text-indigo-600 animate-spin" /><Sparkles className="w-12 h-12 text-indigo-400 absolute -top-4 -right-4 animate-pulse" /></div>
            <div className="text-center space-y-4"><h2 className="text-4xl font-black text-slate-900 tracking-tight">Snekkeren tegner...</h2><p className="text-slate-400 font-bold text-xl">Dette tar ca 30-60 sekunder.</p></div>
          </div>
        )}

        {step === 'results' && results && (
          <div className="space-y-16 animate-in fade-in pb-32">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-10">
              <div className="space-y-2">
                <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-slate-900 leading-tight">Dine forslag</h2>
                <p className="text-slate-500 text-xl font-medium">Trykk for å se detaljer eller endre tegningen.</p>
              </div>
              {renderProgress && (
                <div className="bg-white p-4 rounded-3xl shadow-lg border border-indigo-100 flex items-center gap-4 animate-pulse">
                  <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                  <p className="text-xl font-black text-indigo-600">{renderProgress.current} / {renderProgress.total}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              {results.design_proposals.map((proposal, idx) => (
                <div key={proposal.id} className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-slate-100 flex flex-col group hover:shadow-2xl transition-all duration-500 relative">
                  <div className="aspect-[4/3] bg-slate-900 relative overflow-hidden">
                    {proposal.visual_image ? (
                      <>
                        <img src={proposal.visual_image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[1.5s] cursor-zoom-in" alt={`Variant ${idx+1}`} onClick={() => setSelectedImage(proposal.visual_image!)} />
                        <button onClick={() => setSelectedImage(proposal.visual_image!)} className="absolute bottom-4 right-4 bg-white/20 backdrop-blur-md p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-white hover:bg-white/40"><Maximize2 className="w-6 h-6" /></button>
                      </>
                    ) : variantErrors[proposal.id] ? (
                      <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-4 bg-slate-800">
                        <AlertCircle className="w-12 h-12 text-red-400" />
                        <p className="text-white font-bold text-sm">Tegningen feilet</p>
                        <button onClick={() => generateSingleImage(proposal.id, proposal)} className="bg-white/10 text-white px-4 py-2 rounded-full text-xs font-black uppercase flex items-center gap-2 hover:bg-white/20"><RefreshCw className="w-3 h-3" /> Prøv på nytt</button>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-white/40 space-y-4 bg-slate-800">
                        <Loader2 className="animate-spin w-12 h-12" />
                        <p className="text-xs font-black uppercase tracking-widest">Genererer variant 0{idx+1}...</p>
                      </div>
                    )}
                    <div className="absolute top-4 left-4 z-10"><span className="bg-indigo-600 text-white px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest shadow-2xl">V{idx+1}</span></div>
                  </div>
                  <div className="p-8 flex flex-col flex-grow justify-between gap-6">
                    <div className="space-y-4">
                      <h3 className="font-black text-slate-800 uppercase tracking-tight text-lg">{proposal.style_package}</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100"><p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Materiale</p><p className="text-xs font-bold text-slate-700 truncate">{proposal.fronts.material.replace('_', ' ')}</p></div>
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100"><p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Farge</p><p className="text-xs font-bold text-slate-700 truncate">{proposal.fronts.color}</p></div>
                      </div>
                    </div>
                    <button onClick={() => { setSelectedProposalId(proposal.id); setStep('selected'); }} className="w-full py-4 bg-slate-900 hover:bg-indigo-600 text-white font-black text-xs rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg uppercase tracking-widest active:scale-95">Tilpass forslag <ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex flex-col items-center justify-center pt-20 border-t border-slate-200 gap-8">
               <button onClick={reset} className="text-slate-400 font-black hover:text-red-500 transition-colors uppercase tracking-widest text-xs px-10 py-5">Start på nytt</button>
            </div>
          </div>
        )}

        {step === 'selected' && selectedProposal && (
          <div className="max-w-2xl mx-auto space-y-12 animate-in zoom-in-95 pb-32">
            <h2 className="text-5xl font-black tracking-tighter text-center">Gjør endringer</h2>
            <div className="bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100">
               <div className="relative h-96 group">
                 {selectedProposal.visual_image && <img src={selectedProposal.visual_image} className="w-full h-full object-cover cursor-zoom-in" onClick={() => setSelectedImage(selectedProposal.visual_image!)} alt="Valgt" />}
                 <button onClick={goBack} className="absolute top-6 left-6 bg-white/90 backdrop-blur-md text-slate-800 px-6 py-3 rounded-full font-black text-xs flex items-center gap-2 shadow-2xl hover:bg-white transition-all uppercase tracking-widest"><ChevronLeft className="w-4 h-4" /> Velg en annen</button>
                 {isRefining === selectedProposal.id && <div className="absolute inset-0 bg-white/60 backdrop-blur-md flex items-center justify-center z-20"><Loader2 className="w-16 h-16 text-indigo-600 animate-spin" /></div>}
               </div>
               <div className="p-12 space-y-10">
                  <div className="flex justify-between items-end border-b-2 border-slate-50 pb-8 gap-4">
                    <div className="space-y-1"><h3 className="text-4xl font-black uppercase tracking-tight text-slate-800">{selectedProposal.style_package}</h3><p className="text-indigo-600 font-black text-sm uppercase tracking-widest">Snekkerbygd skreddersøm</p></div>
                    <div className="text-right"><p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Dimensjoner</p><p className="font-black text-2xl text-slate-800">{selectedProposal.dimensions_mm.width}×{selectedProposal.dimensions_mm.height} mm</p></div>
                  </div>
                  <div className="space-y-6">
                     <label className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-2 tracking-widest"><MessageSquare className="w-4 h-4 text-indigo-400" /> Hva vil du endre?</label>
                     <textarea placeholder="F.eks: Kan vi få én dør til? Bytt fargen til mørkegrå..." className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] min-h-[140px] focus:border-indigo-500 outline-none resize-none font-medium shadow-inner leading-relaxed" value={selectedProposal.user_refinement || ''} onChange={(e) => { const newProposals = results!.design_proposals.map(p => p.id === selectedProposal.id ? { ...p, user_refinement: e.target.value } : p); setResults({ ...results!, design_proposals: newProposals }); }} />
                     <button onClick={() => handleRefine(selectedProposal.id)} disabled={isRefining === selectedProposal.id || !selectedProposal.user_refinement} className="w-full py-6 bg-indigo-600 text-white font-black text-xl rounded-[2rem] shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"><Sparkles className="w-6 h-6" /> Oppdater tegningen</button>
                  </div>
                  <div className="flex gap-6 pt-4">
                     <button onClick={goBack} className="flex-1 py-6 bg-slate-100 text-slate-500 font-black rounded-[2.5rem] transition-all text-sm">Tilbake</button>
                     <button onClick={() => setStep('report')} className="flex-[2] py-6 bg-slate-900 text-white font-black text-2xl rounded-[2.5rem] shadow-2xl hover:bg-black transition-all flex items-center justify-center gap-3">Prosjektrapport <ChevronRight className="w-8 h-8" /></button>
                  </div>
               </div>
            </div>
          </div>
        )}

        {step === 'report' && selectedProposal && (
          <div className="animate-in fade-in py-12 print:py-0 max-w-4xl mx-auto pb-32">
            <div className="flex justify-center gap-6 mb-12 print:hidden">
              <button onClick={handleDownloadPDF} disabled={isGeneratingPDF} className="bg-indigo-600 text-white px-10 py-5 rounded-[2.5rem] font-black text-xl flex items-center gap-4 shadow-2xl hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50">
                {isGeneratingPDF ? <Loader2 className="animate-spin w-6 h-6" /> : <Download className="w-6 h-6" />} Last ned PDF
              </button>
              <button onClick={() => window.print()} className="bg-slate-900 text-white px-10 py-5 rounded-[2.5rem] font-black text-xl flex items-center gap-4 shadow-2xl hover:bg-slate-800 transition-all active:scale-95">
                <Printer className="w-6 h-6" /> Skriv ut
              </button>
            </div>

            <div ref={reportRef} className="pdf-report-layout bg-white shadow-2xl print:shadow-none border border-slate-100 overflow-hidden">
              <div className="report-page p-16 min-h-[1000px] flex flex-col justify-between">
                <div>
                  <div className="border-b-8 border-slate-900 pb-10 mb-10 flex justify-between items-end">
                    <div className="space-y-6">
                      <div className="flex items-center gap-4"><div className="bg-slate-900 p-3 rounded-2xl shadow-xl"><Box className="text-white w-8 h-8" /></div><span className="font-black text-4xl tracking-tighter">Snekker AIndersen</span></div>
                      <div><h1 className="text-6xl font-black uppercase tracking-tighter leading-none mb-3 text-slate-900">Prosjektrapport</h1><p className="text-slate-400 font-black uppercase tracking-widest text-[11px]">ID: MOB-{Math.floor(Math.random()*10000)} • {new Date().toLocaleDateString('no-NO')}</p></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-16 mb-20 avoid-break">
                    <div className="space-y-10">
                        <div className="space-y-4">
                          <h2 className="text-xs font-black uppercase text-indigo-500 border-b-2 border-indigo-50 pb-2"><ClipboardList className="w-4 h-4 inline mr-2" /> Spesifikasjoner</h2>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-sm"><p className="text-[9px] font-black text-slate-300 uppercase mb-1">Møbeltype</p><p className="font-black text-xl text-slate-800">{inputs.productType}</p></div>
                            <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-sm"><p className="text-[9px] font-black text-slate-300 uppercase mb-1">Status</p><p className="font-black text-xl text-indigo-600">Godkjent</p></div>
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-sm text-center"><p className="text-[9px] font-black text-slate-300 uppercase mb-1">Bredde</p><p className="font-black text-xl text-slate-800">{inputs.width}mm</p></div>
                            <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-sm text-center"><p className="text-[9px] font-black text-slate-300 uppercase mb-1">Høyde</p><p className="font-black text-xl text-slate-800">{inputs.height}mm</p></div>
                            <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-sm text-center"><p className="text-[9px] font-black text-slate-300 uppercase mb-1">Dybde</p><p className="font-black text-xl text-slate-800">{inputs.depth}mm</p></div>
                          </div>
                        </div>
                        <div className="p-8 bg-indigo-50 rounded-[2.5rem] border border-indigo-100">
                          <p className="text-[10px] font-black text-indigo-400 uppercase mb-4">Prosjektbeskrivelse</p>
                          <p className="text-base font-bold text-indigo-900 italic leading-relaxed">"{inputs.description || 'Ingen spesifisert.'}"</p>
                        </div>
                    </div>
                    <div className="relative rounded-[3rem] overflow-hidden border-4 border-slate-50 shadow-2xl">
                        <img src={inputs.image!} className="w-full h-full object-cover grayscale brightness-75" alt="Befaring" />
                        {inputs.placement_point && <div className="absolute z-10 flex items-center justify-center pointer-events-none" style={{ left: `${inputs.placement_point.x}%`, top: `${inputs.placement_point.y}%`, transform: 'translate(-50%, -50%)' }}><div className="bg-indigo-600 text-white p-2 rounded-full shadow-2xl border-2 border-white"><MapPin className="w-5 h-5" /></div></div>}
                    </div>
                  </div>
                </div>
                <div className="text-center opacity-30 mt-auto"><p className="text-[10px] font-black uppercase tracking-[0.6em]">Side 1 / 2</p></div>
              </div>

              <div className="html2pdf__page-break"></div>

              <div className="report-page p-16 min-h-[1000px] flex flex-col">
                <div className="mb-10"><h2 className="text-xs font-black uppercase text-indigo-500 border-b-2 border-indigo-50 pb-2"><Layout className="w-4 h-4 inline mr-2" /> Konstruksjonstegning</h2></div>
                <div className="space-y-12 flex-grow">
                   <div className="avoid-break">
                      <div className="relative overflow-hidden rounded-[3.5rem] shadow-2xl border-8 border-slate-50 mb-10">
                        <img src={selectedProposal.visual_image} className="w-full h-auto max-h-[500px] object-cover" alt="Visualisering" />
                        <div className="absolute bottom-10 left-10 bg-white/95 backdrop-blur-md px-8 py-4 rounded-[2rem] shadow-2xl border border-slate-100">
                           <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Valgt stilpakke</p>
                           <p className="font-black text-3xl text-slate-900 uppercase tracking-tight">{selectedProposal.style_package}</p>
                        </div>
                      </div>
                   </div>
                   <div className="grid grid-cols-2 gap-12 avoid-break">
                      <div className="p-10 bg-slate-50 rounded-[3.5rem] border border-slate-100 shadow-xl space-y-8">
                         <div className="space-y-4">
                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2">Detaljinformasjon</p>
                            <div className="flex justify-between border-b border-slate-200 pb-2"><p className="text-[10px] font-black text-slate-400 uppercase">Fronter</p><p className="text-base font-black text-slate-700">{selectedProposal.fronts.material.replace('_', ' ')}</p></div>
                            <div className="flex justify-between border-b border-slate-200 pb-2"><p className="text-[10px] font-black text-slate-400 uppercase">Farge</p><p className="text-base font-black text-slate-700">{selectedProposal.fronts.color}</p></div>
                            <div className="flex justify-between border-b border-slate-200 pb-2"><p className="text-[10px] font-black text-slate-400 uppercase">Grep</p><p className="text-base font-black text-slate-700">{selectedProposal.handle_solution.replace(/_/g, ' ')}</p></div>
                         </div>
                      </div>
                      <div className="p-10 bg-slate-50 rounded-[3.5rem] border border-slate-100 shadow-xl space-y-6">
                        <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2"><Layers className="w-4 h-4" /> Innvendig innredning</p>
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
                <div className="mt-16 pt-10 border-t-4 border-slate-900 text-center avoid-break">
                   <p className="text-base font-black uppercase tracking-[0.4em] mb-2 text-slate-900">Snekker AIndersen • Autorisert Prosjekt</p>
                   <p className="text-[10px] text-slate-400 font-bold">Side 2 / 2</p>
                </div>
              </div>
            </div>
            <div className="mt-16 flex justify-center gap-8 print:hidden">
               <button onClick={reset} className="px-12 py-5 bg-white border-2 border-slate-200 text-slate-600 font-black rounded-[2.5rem] hover:bg-slate-50 shadow-xl transition-all uppercase tracking-widest text-[10px]">Start på nytt</button>
               <button onClick={() => setStep('selected')} className="px-12 py-5 bg-slate-900 text-white font-black rounded-[2.5rem] hover:bg-slate-800 shadow-2xl transition-all uppercase tracking-widest text-[10px]">Endre design</button>
            </div>
          </div>
        )}
      </main>
      
      <footer className="mt-20 py-16 border-t border-slate-100 text-center opacity-30 print:hidden">
         <p className="text-[10px] font-black uppercase tracking-[0.4em]">Snekker AIndersen AI-Engine v6.8 • Oslo, Norge</p>
      </footer>
    </div>
  );
}
