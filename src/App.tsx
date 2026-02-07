import { useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import WaveSurfer from "wavesurfer.js";
import { analyze } from "web-audio-beat-detector";
import { Store } from "@tauri-apps/plugin-store";
import "./App.css";

type DeckId = "A" | "B";
type FxKey = "reverb" | "delay" | "filter" | "gate";
type MidiMap = {
  deckAPlay: number;
  deckBPlay: number;
  crossfader: number;
  master: number;
  fxAReverb: number;
  fxADelay: number;
  fxAFilter: number;
  fxAGate: number;
  fxBReverb: number;
  fxBDelay: number;
  fxBFilter: number;
  fxBGate: number;
  recordToggle: number;
};

const DEFAULT_MIDI: MidiMap = {
  deckAPlay: 60,
  deckBPlay: 62,
  crossfader: 1,
  master: 7,
  fxAReverb: 20,
  fxADelay: 21,
  fxAFilter: 22,
  fxAGate: 23,
  fxBReverb: 24,
  fxBDelay: 25,
  fxBFilter: 26,
  fxBGate: 27,
  recordToggle: 40,
};

const DEFAULT_PRESETS: Array<{ name: string; midiMap: MidiMap }> = [
  { name: "Default", midiMap: DEFAULT_MIDI },
  {
    name: "Compact",
    midiMap: {
      ...DEFAULT_MIDI,
      fxAReverb: 36,
      fxADelay: 37,
      fxAFilter: 38,
      fxAGate: 39,
      fxBReverb: 40,
      fxBDelay: 41,
      fxBFilter: 42,
      fxBGate: 43,
    },
  },
];

type DeckNodes = {
  eq: Partial<Record<BiquadFilterType, BiquadFilterNode>>;
  filter?: BiquadFilterNode;
  delay?: DelayNode;
  delayFeedback?: GainNode;
  reverb?: ConvolverNode;
  gate?: DynamicsCompressorNode;
  analyser?: AnalyserNode;
};

type FxPreset = {
  name: string;
  fx: Record<FxKey, boolean>;
  wet: Record<FxKey, number>;
};

type SessionState = {
  name: string;
  savedAt: string;
  deckA?: { trackName?: string; bpm?: number | null };
  deckB?: { trackName?: string; bpm?: number | null };
  fxA: Record<FxKey, boolean>;
  fxB: Record<FxKey, boolean>;
  wetA: Record<FxKey, number>;
  wetB: Record<FxKey, number>;
  crossfader: number;
  master: number;
  performanceMode: boolean;
  darkMode: boolean;
  beatSnap: boolean;
  midiMap: MidiMap;
};

const DEFAULT_FX_PRESETS: FxPreset[] = [
  {
    name: "Clean",
    fx: { reverb: false, delay: false, filter: false, gate: false },
    wet: { reverb: 0.2, delay: 0.15, filter: 0.4, gate: 0.4 },
  },
  {
    name: "Wide",
    fx: { reverb: true, delay: true, filter: false, gate: false },
    wet: { reverb: 0.6, delay: 0.35, filter: 0.4, gate: 0.4 },
  },
  {
    name: "Tight",
    fx: { reverb: false, delay: false, filter: true, gate: true },
    wet: { reverb: 0.2, delay: 0.2, filter: 0.5, gate: 0.7 },
  },
];

const SPECTRUM_BARS = 24;

function App() {
  const logoUrl = `${import.meta.env.BASE_URL}logo.jpeg`;
  const [showDownloads, setShowDownloads] = useState(false);
  const deckARef = useRef<HTMLDivElement | null>(null);
  const deckBRef = useRef<HTMLDivElement | null>(null);
  const waveARef = useRef<WaveSurfer | null>(null);
  const waveBRef = useRef<WaveSurfer | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterARef = useRef<HTMLDivElement | null>(null);
  const meterBRef = useRef<HTMLDivElement | null>(null);
  const meterLevelRef = useRef({ A: 0, B: 0 });
  const spectrumBarsRef = useRef<HTMLSpanElement[]>([]);
  const spectrumLevelsRef = useRef<number[]>(
    Array.from({ length: SPECTRUM_BARS }, () => 0)
  );
  const nodesRef = useRef<Record<DeckId, DeckNodes>>({
    A: { eq: {} },
    B: { eq: {} },
  });
  const storeRef = useRef<Store | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const [deckAPlaying, setDeckAPlaying] = useState(false);
  const [deckBPlaying, setDeckBPlaying] = useState(false);
  const [deckATrackName, setDeckATrackName] = useState<string | null>(null);
  const [deckBTrackName, setDeckBTrackName] = useState<string | null>(null);
  const [crossfader, setCrossfader] = useState(55);
  const [master, setMaster] = useState(72);
  const [performanceMode, setPerformanceMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const navigate = useNavigate();
  const [beatSnap, setBeatSnap] = useState(true);
  const [midiStatus, setMidiStatus] = useState("MIDI Offline");
  const [liveMode, setLiveMode] = useState(false);
  const [bpmA, setBpmA] = useState<number | null>(null);
  const [bpmB, setBpmB] = useState<number | null>(null);
  const [tempoA, setTempoA] = useState(1);
  const [tempoB, setTempoB] = useState(1);
  const [durationA, setDurationA] = useState(0);
  const [durationB, setDurationB] = useState(0);
  const [fxA, setFxA] = useState<Record<FxKey, boolean>>({
    reverb: false,
    delay: false,
    filter: false,
    gate: false,
  });
  const [fxB, setFxB] = useState<Record<FxKey, boolean>>({
    reverb: false,
    delay: false,
    filter: false,
    gate: false,
  });
  const [wetA, setWetA] = useState({
    reverb: 0.35,
    delay: 0.25,
    filter: 0.5,
    gate: 0.5,
  });
  const [wetB, setWetB] = useState({
    reverb: 0.35,
    delay: 0.25,
    filter: 0.5,
    gate: 0.5,
  });
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const [armedA, setArmedA] = useState(false);
  const [armedB, setArmedB] = useState(false);
  const [lastTap, setLastTap] = useState(0);
  const [ambientPulse, setAmbientPulse] = useState(0);
  const [eqA, setEqA] = useState({ low: 0, mid: 0, high: 0 });
  const [eqB, setEqB] = useState({ low: 0, mid: 0, high: 0 });

  const goGuide = () => navigate("/guide");
  const goHome = () => navigate("/");

  useEffect(() => {
    if (window.location.hash === "#/guide") {
      navigate("/guide", { replace: true });
    }
  }, [navigate]);
  const [midiMap, setMidiMap] = useState<MidiMap>(DEFAULT_MIDI);
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState(DEFAULT_PRESETS);
  const [fxPresetsA, setFxPresetsA] = useState<FxPreset[]>(DEFAULT_FX_PRESETS);
  const [fxPresetsB, setFxPresetsB] = useState<FxPreset[]>(DEFAULT_FX_PRESETS);
  const [fxPresetNameA, setFxPresetNameA] = useState("");
  const [fxPresetNameB, setFxPresetNameB] = useState("");
  const [sessions, setSessions] = useState<SessionState[]>([]);
  const [sessionName, setSessionName] = useState("");

  const volumes = useMemo(() => {
    const x = crossfader / 100;
    const masterGain = master / 100;
    return {
      a: (1 - x) * masterGain,
      b: x * masterGain,
    };
  }, [crossfader, master]);

  const beatMs = useMemo(() => {
    const bpms = [bpmA, bpmB].filter((v) => typeof v === "number") as number[];
    const bpm = bpms.length ? bpms.reduce((a, b) => a + b, 0) / bpms.length : 120;
    return Math.max(250, Math.min(1200, 60000 / bpm));
  }, [bpmA, bpmB]);

  useEffect(() => {
    if (!deckARef.current || !deckBRef.current) return;

    waveARef.current = WaveSurfer.create({
      container: deckARef.current,
      waveColor: "rgba(54, 245, 213, 0.35)",
      progressColor: "rgba(54, 245, 213, 0.9)",
      cursorColor: "rgba(255, 107, 61, 0.8)",
      height: 110,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      normalize: true,
    });

    waveBRef.current = WaveSurfer.create({
      container: deckBRef.current,
      waveColor: "rgba(107, 123, 255, 0.35)",
      progressColor: "rgba(107, 123, 255, 0.9)",
      cursorColor: "rgba(255, 107, 61, 0.8)",
      height: 110,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      normalize: true,
    });

    const waveA = waveARef.current;
    const waveB = waveBRef.current;

    waveA.on("play", () => setDeckAPlaying(true));
    waveA.on("pause", () => setDeckAPlaying(false));
    waveB.on("play", () => setDeckBPlaying(true));
    waveB.on("pause", () => setDeckBPlaying(false));
    waveA.on("ready", () => {
      setDurationA(waveA.getDuration());
      applyFilters("A");
      attachAnalyser("A", waveA);
    });
    waveB.on("ready", () => {
      setDurationB(waveB.getDuration());
      applyFilters("B");
      attachAnalyser("B", waveB);
    });

    return () => {
      waveA.destroy();
      waveB.destroy();
    };
  }, []);

  useEffect(() => {
    if (waveARef.current) waveARef.current.setVolume(volumes.a);
    if (waveBRef.current) waveBRef.current.setVolume(volumes.b);
  }, [volumes]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      updateMeter("A");
      updateMeter("B");
      updateSpectrum();
      updateAmbient();
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      updateMeter("A");
      updateMeter("B");
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!navigator.requestMIDIAccess) {
      setMidiStatus("MIDI Unsupported");
      return;
    }

    navigator
      .requestMIDIAccess()
      .then((access) => {
        setMidiStatus("MIDI Ready");
        for (const input of access.inputs.values()) {
          input.onmidimessage = (event) => {
            const data = event.data;
            if (!data || data.length < 3) return;
            const [status, data1, data2] = data;
            const command = status & 0xf0;

            if (command === 0x90 && data2 > 0) {
              if (data1 === midiMap.deckAPlay) togglePlay("A");
              if (data1 === midiMap.deckBPlay) togglePlay("B");
              if (data1 === midiMap.fxAReverb) toggleFx("A", "reverb");
              if (data1 === midiMap.fxADelay) toggleFx("A", "delay");
              if (data1 === midiMap.fxAFilter) toggleFx("A", "filter");
              if (data1 === midiMap.fxAGate) toggleFx("A", "gate");
              if (data1 === midiMap.fxBReverb) toggleFx("B", "reverb");
              if (data1 === midiMap.fxBDelay) toggleFx("B", "delay");
              if (data1 === midiMap.fxBFilter) toggleFx("B", "filter");
              if (data1 === midiMap.fxBGate) toggleFx("B", "gate");
              if (data1 === midiMap.recordToggle) toggleRecord();
            }

            if (command === 0xb0) {
              if (data1 === midiMap.crossfader)
                setCrossfader(Math.round((data2 / 127) * 100));
              if (data1 === midiMap.master)
                setMaster(Math.round((data2 / 127) * 100));
            }
          };
        }
      })
      .catch(() => setMidiStatus("MIDI Offline"));
  }, [midiMap]);

  useEffect(() => {
    applyFilters("A");
    applyFilters("B");
  }, [fxA, fxB, wetA, wetB]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const store = await Store.load("amarcord_settings.json");
        storeRef.current = store;
        const payload = await store.get<{
          darkMode?: boolean;
          beatSnap?: boolean;
          midiMap?: MidiMap;
          presets?: Array<{ name: string; midiMap: MidiMap }>;
          fxPresetsA?: FxPreset[];
          fxPresetsB?: FxPreset[];
          sessions?: SessionState[];
        }>("ui");
        if (!payload) return;
        if (typeof payload.darkMode === "boolean") setDarkMode(payload.darkMode);
        if (typeof payload.beatSnap === "boolean") setBeatSnap(payload.beatSnap);
        if (payload.midiMap && typeof payload.midiMap === "object") {
          setMidiMap((prev) => ({ ...prev, ...payload.midiMap }));
        }
        if (payload.presets && Array.isArray(payload.presets)) {
          setPresets(payload.presets);
        }
        if (payload.fxPresetsA && Array.isArray(payload.fxPresetsA)) {
          setFxPresetsA(payload.fxPresetsA);
        }
        if (payload.fxPresetsB && Array.isArray(payload.fxPresetsB)) {
          setFxPresetsB(payload.fxPresetsB);
        }
        if (payload.sessions && Array.isArray(payload.sessions)) {
          setSessions(payload.sessions);
        }
        return;
      } catch {
        // Fallback for non-Tauri environments
        const raw = localStorage.getItem("amarcord_settings");
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed.darkMode === "boolean") setDarkMode(parsed.darkMode);
          if (typeof parsed.beatSnap === "boolean") setBeatSnap(parsed.beatSnap);
          if (parsed.midiMap && typeof parsed.midiMap === "object") {
            setMidiMap((prev) => ({ ...prev, ...parsed.midiMap }));
          }
          if (parsed.presets && Array.isArray(parsed.presets)) {
            setPresets(parsed.presets);
          }
          if (parsed.fxPresetsA && Array.isArray(parsed.fxPresetsA)) {
            setFxPresetsA(parsed.fxPresetsA);
          }
          if (parsed.fxPresetsB && Array.isArray(parsed.fxPresetsB)) {
            setFxPresetsB(parsed.fxPresetsB);
          }
          if (parsed.sessions && Array.isArray(parsed.sessions)) {
            setSessions(parsed.sessions);
          }
        } catch {
          return;
        }
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const payload = {
      darkMode,
      beatSnap,
      midiMap,
      presets,
      fxPresetsA,
      fxPresetsB,
      sessions,
    };
    if (!storeRef.current) {
      localStorage.setItem("amarcord_settings", JSON.stringify(payload));
      return;
    }
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(async () => {
      const store = storeRef.current;
      if (!store) return;
      await store.set("ui", payload);
      await store.save();
    }, 200);
  }, [darkMode, beatSnap, midiMap]);

  const togglePlay = (deck: "A" | "B") => {
    const wave = deck === "A" ? waveARef.current : waveBRef.current;
    if (!wave) return;
    const bpm = deck === "A" ? bpmA : bpmB;
    if (!wave.isPlaying() && beatSnap && bpm) {
      const beat = 60 / bpm;
      const t = wave.getCurrentTime();
      const snapped = Math.round(t / beat) * beat;
      wave.setTime(Math.max(0, Math.min(snapped, wave.getDuration())));
    }
    wave.playPause();
    playClick();
  };

  const loadTrack = async (deck: DeckId, file: File | null) => {
    if (!file) return;
    const wave = deck === "A" ? waveARef.current : waveBRef.current;
    if (!wave) return;
    const url = URL.createObjectURL(file);
    wave.load(url);
    if (deck === "A") setDeckATrackName(file.name);
    if (deck === "B") setDeckBTrackName(file.name);
    await analyzeTrack(deck, file);
  };

  const setEQ = (deck: DeckId, type: BiquadFilterType, value: number) => {
    const wave = deck === "A" ? waveARef.current : waveBRef.current;
    if (!wave) return;
    const nodes = ensureNodes(deck, wave);
    if (!nodes) return;
    let filter = nodes.eq[type];
    if (!filter) {
      filter = nodes.eq[type] = createEQFilter(type);
    }
    filter.gain.value = value;
    applyFilters(deck);
  };


  const ensureNodes = (deck: DeckId, wave: WaveSurfer) => {
    const backend = (wave as any).backend;
    if (!backend?.ac) return null;
    const ac: AudioContext = backend.ac;
    audioCtxRef.current = ac;
    const nodes = nodesRef.current[deck];

    if (!nodes.filter) {
      nodes.filter = ac.createBiquadFilter();
      nodes.filter.type = "lowpass";
      nodes.filter.frequency.value = 8000;
      nodes.filter.Q.value = 0.6;
    }

    if (!nodes.delay) {
      nodes.delay = ac.createDelay(1.0);
      nodes.delay.delayTime.value = 0.25;
      nodes.delayFeedback = ac.createGain();
      nodes.delayFeedback.gain.value = 0.35;
      nodes.delay.connect(nodes.delayFeedback);
      nodes.delayFeedback.connect(nodes.delay);
    }

    if (!nodes.reverb) {
      nodes.reverb = ac.createConvolver();
      nodes.reverb.buffer = createImpulse(ac, 1.3, 2.3);
    }

    if (!nodes.gate) {
      nodes.gate = ac.createDynamicsCompressor();
      nodes.gate.threshold.value = -40;
      nodes.gate.ratio.value = 12;
      nodes.gate.attack.value = 0.003;
      nodes.gate.release.value = 0.2;
    }

    return nodes;
  };

  const updateAmbient = () => {
    const pulse = Math.min(1, Math.max(meterLevelRef.current.A, meterLevelRef.current.B));
    setAmbientPulse(pulse);
    document.documentElement.style.setProperty("--pulse", pulse.toString());
  };

  const updateSpectrum = () => {
    const bars = spectrumBarsRef.current;
    if (!bars.length) return;
    const analyserA = nodesRef.current.A.analyser;
    const analyserB = nodesRef.current.B.analyser;
    const dataA =
      analyserA && waveARef.current?.isPlaying()
        ? new Uint8Array(analyserA.frequencyBinCount)
        : null;
    const dataB =
      analyserB && waveBRef.current?.isPlaying()
        ? new Uint8Array(analyserB.frequencyBinCount)
        : null;
    if (dataA && analyserA) analyserA.getByteFrequencyData(dataA);
    if (dataB && analyserB) analyserB.getByteFrequencyData(dataB);

    const levels = spectrumLevelsRef.current;
    for (let i = 0; i < bars.length; i += 1) {
      const idx = Math.floor(((dataA?.length ?? dataB?.length ?? 0) / bars.length) * i);
      const a = dataA ? dataA[idx] ?? 0 : 0;
      const b = dataB ? dataB[idx] ?? 0 : 0;
      const value = Math.max(a, b) / 255;
      const smoothed = Math.max(levels[i] * 0.82, value);
      levels[i] = smoothed;
      bars[i].style.setProperty("--bar", `${Math.round(smoothed * 100)}%`);
    }
  };

  const attachAnalyser = (deck: DeckId, wave: WaveSurfer) => {
    const backend = (wave as any).backend;
    if (!backend?.ac) return;
    const nodes = nodesRef.current[deck];
    if (nodes.analyser) return;
    const analyser = backend.ac.createAnalyser();
    analyser.fftSize = 256;
    nodes.analyser = analyser;
    const gainNode = backend.gainNode ?? backend.outputNode ?? backend.analyser;
    if (gainNode?.connect) {
      gainNode.connect(analyser);
    }
  };

  const updateMeter = (deck: DeckId) => {
    const wave = deck === "A" ? waveARef.current : waveBRef.current;
    const meter = deck === "A" ? meterARef.current : meterBRef.current;
    if (!wave || !meter) return;
    const nodes = nodesRef.current[deck];
    const analyser = nodes.analyser;
    let level = meterLevelRef.current[deck];
    if (analyser && wave.isPlaying()) {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length) / 255;
      level = Math.max(level * 0.85, rms);
    } else {
      level = Math.max(level * 0.9, 0.02);
    }
    meterLevelRef.current[deck] = level;
    meter.style.setProperty("--level", `${Math.round(level * 100)}%`);
  };

  const createEQFilter = (type: BiquadFilterType) => {
    const ac = audioCtxRef.current;
    if (!ac) throw new Error("AudioContext missing");
    const filter = ac.createBiquadFilter();
    filter.type = type;
    filter.frequency.value =
      type === "lowshelf" ? 150 : type === "highshelf" ? 6000 : 1000;
    filter.gain.value = 0;
    return filter;
  };

  const applyFilters = (deck: DeckId) => {
    const wave = deck === "A" ? waveARef.current : waveBRef.current;
    if (!wave) return;
    const nodes = ensureNodes(deck, wave);
    if (!nodes) return;

    const chain: AudioNode[] = [];
    const fxState = deck === "A" ? fxA : fxB;
    const wet = deck === "A" ? wetA : wetB;
    if (fxState.gate && nodes.gate) {
      nodes.gate.threshold.value = -50 + wet.gate * 30;
      chain.push(nodes.gate);
    }
    Object.values(nodes.eq).forEach((node) => {
      if (node) chain.push(node);
    });
    if (fxState.filter && nodes.filter) {
      nodes.filter.frequency.value = 500 + wet.filter * 7500;
      chain.push(nodes.filter);
    }
    if (fxState.delay && nodes.delay) {
      nodes.delay.delayTime.value = 0.05 + wet.delay * 0.45;
      if (nodes.delayFeedback) {
        nodes.delayFeedback.gain.value = 0.1 + wet.delay * 0.6;
      }
      chain.push(nodes.delay);
    }
    if (fxState.reverb && nodes.reverb) {
      if (nodes.reverb.buffer) {
        chain.push(nodes.reverb);
      }
    }

    (wave as any).setFilters(chain);
  };

  const toggleFx = (deck: DeckId, key: FxKey) => {
    if (deck === "A") {
      setFxA((prev) => ({ ...prev, [key]: !prev[key] }));
    } else {
      setFxB((prev) => ({ ...prev, [key]: !prev[key] }));
    }
  };

  const analyzeTrack = async (deck: DeckId, file: File) => {
    try {
      const ctx =
        audioCtxRef.current ??
        new AudioContext({
          latencyHint: "interactive",
        });
      audioCtxRef.current = ctx;
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const result = (await analyze(audioBuffer)) as unknown;
      let bpmValue: number | undefined;
      if (typeof result === "number") {
        bpmValue = result;
      } else if (
        result &&
        typeof result === "object" &&
        "bpm" in result &&
        typeof (result as { bpm?: number }).bpm === "number"
      ) {
        bpmValue = (result as { bpm: number }).bpm;
      }
      if (typeof bpmValue === "number") {
        if (deck === "A") setBpmA(Math.round(bpmValue));
        if (deck === "B") setBpmB(Math.round(bpmValue));
      }
    } catch {
      if (deck === "A") setBpmA(null);
      if (deck === "B") setBpmB(null);
    }
  };

  const createImpulse = (ac: AudioContext, duration: number, decay: number) => {
    const length = ac.sampleRate * duration;
    const impulse = ac.createBuffer(2, length, ac.sampleRate);
    for (let i = 0; i < impulse.numberOfChannels; i += 1) {
      const channelData = impulse.getChannelData(i);
      for (let j = 0; j < length; j += 1) {
        channelData[j] =
          (Math.random() * 2 - 1) * Math.pow(1 - j / length, decay);
      }
    }
    return impulse;
  };

  const beatSize = (bpm: number | null, duration: number) => {
    if (!bpm || !duration) return null;
    const beats = duration / (60 / bpm);
    if (!Number.isFinite(beats) || beats <= 0) return null;
    return Math.max(1.5, 100 / beats);
  };

  const toggleRecord = () => {
    const wave = waveARef.current;
    const backend = wave ? (wave as any).backend : null;
    const ac: AudioContext | null = backend?.ac ?? audioCtxRef.current;
    if (!ac) return;

    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      playClick();
      return;
    }

    const destination = ac.createMediaStreamDestination();
    try {
      const source = ac.destination;
      source.connect(destination);
    } catch {
      return;
    }

    const recorder = new MediaRecorder(destination.stream, {
      mimeType: "audio/webm",
    });
    recorderRef.current = recorder;
    recordChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordChunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(recordChunksRef.current, { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      setRecordedUrl(url);
    };
    recorder.start();
    setRecording(true);
    playClick();
  };

  const setTempo = (deck: DeckId, value: number) => {
    const wave = deck === "A" ? waveARef.current : waveBRef.current;
    if (!wave) return;
    wave.setPlaybackRate(value, true);
    if (deck === "A") setTempoA(value);
    if (deck === "B") setTempoB(value);
  };

  const syncTempo = (deck: DeckId) => {
    const sourceBpm = deck === "A" ? bpmB : bpmA;
    const targetBpm = deck === "A" ? bpmA : bpmB;
    if (!sourceBpm || !targetBpm) return;
    const ratio = sourceBpm / targetBpm;
    setTempo(deck, Math.min(1.5, Math.max(0.6, ratio)));
    playClick();
  };

  const playClick = () => {
    const ac =
      audioCtxRef.current ??
      new AudioContext({
        latencyHint: "interactive",
      });
    audioCtxRef.current = ac;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      (navigator as any).vibrate?.(8);
    }
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "triangle";
    osc.frequency.value = 760;
    gain.gain.value = 0.001;
    osc.connect(gain);
    gain.connect(ac.destination);
    const now = ac.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.start(now);
    osc.stop(now + 0.09);
  };

  const tapTempo = (deck: DeckId) => {
    const now = performance.now();
    if (!lastTap) {
      setLastTap(now);
      return;
    }
    const interval = now - lastTap;
    setLastTap(now);
    if (interval < 250 || interval > 2000) return;
    const bpm = 60000 / interval;
    if (deck === "A") setBpmA(Math.round(bpm));
    if (deck === "B") setBpmB(Math.round(bpm));
    playClick();
  };

  const saveFxPreset = (deck: DeckId) => {
    const name = (deck === "A" ? fxPresetNameA : fxPresetNameB).trim();
    if (!name) return;
    const fx = deck === "A" ? fxA : fxB;
    const wet = deck === "A" ? wetA : wetB;
    const payload: FxPreset = { name, fx: { ...fx }, wet: { ...wet } };
    if (deck === "A") {
      setFxPresetsA((prev) => {
        const without = prev.filter((p) => p.name !== name);
        return [...without, payload];
      });
      setFxPresetNameA("");
    } else {
      setFxPresetsB((prev) => {
        const without = prev.filter((p) => p.name !== name);
        return [...without, payload];
      });
      setFxPresetNameB("");
    }
  };

  const applyFxPreset = (deck: DeckId, name: string) => {
    const list = deck === "A" ? fxPresetsA : fxPresetsB;
    const preset = list.find((p) => p.name === name);
    if (!preset) return;
    if (deck === "A") {
      setFxA(preset.fx);
      setWetA(preset.wet);
    } else {
      setFxB(preset.fx);
      setWetB(preset.wet);
    }
  };

  const saveSession = () => {
    const name = sessionName.trim();
    if (!name) return;
    const payload: SessionState = {
      name,
      savedAt: new Date().toISOString(),
      deckA: { trackName: deckATrackName ?? undefined, bpm: bpmA },
      deckB: { trackName: deckBTrackName ?? undefined, bpm: bpmB },
      fxA,
      fxB,
      wetA,
      wetB,
      crossfader,
      master,
      performanceMode,
      darkMode,
      beatSnap,
      midiMap,
    };
    setSessions((prev) => {
      const without = prev.filter((s) => s.name !== name);
      return [...without, payload];
    });
    setSessionName("");
  };

  const loadSession = (name: string) => {
    const session = sessions.find((s) => s.name === name);
    if (!session) return;
    setFxA(session.fxA);
    setFxB(session.fxB);
    setWetA(session.wetA);
    setWetB(session.wetB);
    setCrossfader(session.crossfader);
    setMaster(session.master);
    setPerformanceMode(session.performanceMode);
    setDarkMode(session.darkMode);
    setBeatSnap(session.beatSnap);
    setMidiMap(session.midiMap);
    if (session.deckA?.trackName) setDeckATrackName(session.deckA.trackName);
    if (session.deckB?.trackName) setDeckBTrackName(session.deckB.trackName);
    if (typeof session.deckA?.bpm === "number") setBpmA(session.deckA.bpm);
    if (typeof session.deckB?.bpm === "number") setBpmB(session.deckB.bpm);
  };

  const deleteSession = (name: string) => {
    setSessions((prev) => prev.filter((s) => s.name !== name));
  };

  const resetPreferences = () => {
    setDarkMode(false);
    setBeatSnap(true);
    setMidiMap(DEFAULT_MIDI);
    setPresets(DEFAULT_PRESETS);
    setFxPresetsA(DEFAULT_FX_PRESETS);
    setFxPresetsB(DEFAULT_FX_PRESETS);
    setSessions([]);
  };

  const exportSettings = () => {
    const payload = {
      darkMode,
      beatSnap,
      midiMap,
      presets,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "amarcord-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSettings = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (typeof parsed.darkMode === "boolean") setDarkMode(parsed.darkMode);
      if (typeof parsed.beatSnap === "boolean") setBeatSnap(parsed.beatSnap);
      if (parsed.midiMap && typeof parsed.midiMap === "object") {
        setMidiMap((prev) => ({ ...prev, ...parsed.midiMap }));
      }
      if (parsed.presets && Array.isArray(parsed.presets)) {
        setPresets(parsed.presets);
      }
    } catch {
      return;
    }
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    setPresets((prev) => {
      const without = prev.filter((p) => p.name !== name);
      return [...without, { name, midiMap: { ...midiMap } }];
    });
    setPresetName("");
  };

  const applyPreset = (name: string) => {
    const preset = presets.find((p) => p.name === name);
    if (preset) setMidiMap(preset.midiMap);
  };

  return (
    <div
      className={`app ${performanceMode ? "performance" : ""}`}
      style={{ ["--pulse" as any]: ambientPulse }}
    >
      <header
        className="topbar glass beat-sync"
        style={{ ["--beat-ms" as any]: `${beatMs}ms` }}
      >
        <div className="brand">
          <div className="logo-frame">
            <img src={logoUrl} alt="AmarcordDJ logo" />
          </div>
          <div className="brand-text">
            <span className="brand-title">AmarcordDJ</span>
            <span className="brand-sub">Studio Edition</span>
          </div>
        </div>
        <div className="status">
          <div className="status-pill">
            <span className="dot live" />
            <span>Audio Engine Online</span>
          </div>
          <div className="status-pill">
            <span className={`dot ${liveMode ? "sync" : "midi"}`} />
            <span>{liveMode ? "Live" : "Standby"}</span>
          </div>
          <div className="status-pill">
            <span className="dot sync" />
            <span>Sync: 124 BPM</span>
          </div>
          <div className="status-pill">
            <span className="dot midi" />
            <span>{midiStatus}</span>
          </div>
        </div>
        <div className="top-actions">
          <button className="primary" onClick={() => setShowDownloads(true)}>
            Download
          </button>
          <button
            className="primary"
            onClick={() => {
              window.location.hash = "#/guide";
              goGuide();
            }}
          >
            Guide
          </button>
          <button className="primary" onClick={() => setLiveMode((prev) => !prev)}>
            {liveMode ? "Stop Live" : "Go Live"}
          </button>
          <button
            className="primary"
            onClick={() => {
              window.open(
                "https://josealvarezdev.github.io/AmarcordDJ/",
                "_blank",
                "noopener,noreferrer"
              );
            }}
          >
            Live Demo
          </button>
          <a
            className="kofi-link"
            href="https://ko-fi.com/josealvarezdev"
            target="_blank"
            rel="noreferrer"
          >
            Support this project
          </a>
        </div>
      </header>

      {showDownloads && (
        <div className="download-modal" onClick={() => setShowDownloads(false)}>
          <div
            className="download-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="download-head">
              <span>Download AmarcordDJ</span>
              <button
                className="ghost"
                onClick={() => setShowDownloads(false)}
              >
                Close
              </button>
            </div>
            <p className="download-sub">
              Latest release: v0.1.0 • macOS Apple Silicon
            </p>
            <div className="download-grid">
              <a
                className="download-button mac"
                href="https://github.com/JoseAlvarezDev/AmarcordDJ/releases/download/v0.1.0/AmarcordDJ_0.1.0_aarch64.dmg.zip"
                target="_blank"
                rel="noreferrer"
              >
                <span className="icon">MAC</span>
                <span className="label">macOS (Apple Silicon)</span>
                <span className="meta">DMG (.zip)</span>
              </a>
              <a
                className="download-button alt"
                href="https://github.com/JoseAlvarezDev/AmarcordDJ/releases/download/v0.1.0/AmarcordDJ_0.1.0_aarch64.app.zip"
                target="_blank"
                rel="noreferrer"
              >
                <span className="icon">MAC</span>
                <span className="label">macOS App Bundle</span>
                <span className="meta">.app (.zip)</span>
              </a>
              <div className="download-button disabled">
                <span className="icon">WIN</span>
                <span className="label">Windows</span>
                <span className="meta">Coming soon</span>
              </div>
              <div className="download-button disabled">
                <span className="icon">LNX</span>
                <span className="label">Linux</span>
                <span className="meta">Coming soon</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <Routes>
        <Route
          path="/"
          element={
            <>
              <section className="stage booth">
        <div className="booth-light left" />
        <div className="booth-light right" />
        <div className="decks">
          <div className="deck glass reveal delay-1">
            <div className="deck-light a" />
            <div className="deck-head">
              <span className="deck-label">
                Deck A
                <button
                  className={`arm-btn ${armedA ? "active" : ""}`}
                  onClick={() => {
                    setArmedA((prev) => !prev);
                    playClick();
                  }}
                >
                  Arm
                </button>
                <span
                  className={`beat-led a ${bpmA ? "pulse" : ""}`}
                  style={{ ["--beat-ms" as any]: bpmA ? `${60000 / bpmA}ms` : "600ms" }}
                />
              </span>
              <span className="deck-track">
                {deckATrackName ?? "Fractal Memories"}
                <span className="deck-bpm">
                  {bpmA ? `${bpmA} BPM` : "BPM --"}
                </span>
              </span>
            </div>
            <div className="waveform">
              <div className="wave-grid" />
              {beatSize(bpmA, durationA) && (
                <div
                  className="beat-grid"
                  style={{
                    ["--beat-size" as any]: `${beatSize(bpmA, durationA)}%`,
                    ["--bar-size" as any]: `${(beatSize(bpmA, durationA) ?? 0) * 4}%`,
                  }}
                />
              )}
              {beatSize(bpmA, durationA) && (
                <div
                  className="downbeat-grid"
                  style={{
                    ["--bar-size" as any]: `${(beatSize(bpmA, durationA) ?? 0) * 4}%`,
                  }}
                />
              )}
              <div className="wave-canvas" ref={deckARef} />
            </div>
            <div className="deck-controls">
              <button
                className="chip ghost"
                onClick={() => {
                  playClick();
                }}
              >
                <span className="icon-cue" />
                Cue
              </button>
              <button
                className={`play-btn ${deckAPlaying ? "active" : ""}`}
                onClick={() => togglePlay("A")}
              >
                <span className={deckAPlaying ? "icon-pause" : "icon-play"} />
                {deckAPlaying ? "Pause" : "Play"}
              </button>
              <button className="chip" onClick={() => syncTempo("A")}>
                <span className="icon-sync" />
                Sync
              </button>
              <button className="chip ghost" onClick={() => tapTempo("A")}>
                Tap
              </button>
              <div className="fader">
                <span>Tempo</span>
                <div
                  className="knob-shell tempo"
                  style={{
                    ["--knob-rot" as any]: `${((tempoA - 0.6) / 0.9) * 270 - 135}deg`,
                    ["--knob-fill" as any]: `${((tempoA - 0.6) / 0.9) * 100}%`,
                  }}
                >
                  <div className="knob-dial" />
                  <input
                    className="knob-input"
                    type="range"
                    min="0.6"
                    max="1.5"
                    step="0.01"
                    value={tempoA}
                    onChange={(e) => setTempo("A", Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="knobs">
                <div className="knob">
                  <span>Low</span>
                  <div
                    className="knob-shell"
                    style={{
                      ["--knob-rot" as any]: `${((eqA.low + 12) / 24) * 270 - 135}deg`,
                      ["--knob-fill" as any]: `${((eqA.low + 12) / 24) * 100}%`,
                    }}
                  >
                    <div className="knob-dial" />
                    <input
                      className="knob-input"
                      type="range"
                      min="-12"
                      max="12"
                      value={eqA.low}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setEqA((prev) => ({ ...prev, low: value }));
                        setEQ("A", "lowshelf", value);
                      }}
                    />
                  </div>
                </div>
                <div className="knob">
                  <span>Mid</span>
                  <div
                    className="knob-shell"
                    style={{
                      ["--knob-rot" as any]: `${((eqA.mid + 12) / 24) * 270 - 135}deg`,
                      ["--knob-fill" as any]: `${((eqA.mid + 12) / 24) * 100}%`,
                    }}
                  >
                    <div className="knob-dial" />
                    <input
                      className="knob-input"
                      type="range"
                      min="-12"
                      max="12"
                      value={eqA.mid}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setEqA((prev) => ({ ...prev, mid: value }));
                        setEQ("A", "peaking", value);
                      }}
                    />
                  </div>
                </div>
                <div className="knob">
                  <span>High</span>
                  <div
                    className="knob-shell"
                    style={{
                      ["--knob-rot" as any]: `${((eqA.high + 12) / 24) * 270 - 135}deg`,
                      ["--knob-fill" as any]: `${((eqA.high + 12) / 24) * 100}%`,
                    }}
                  >
                    <div className="knob-dial" />
                    <input
                      className="knob-input"
                      type="range"
                      min="-12"
                      max="12"
                      value={eqA.high}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setEqA((prev) => ({ ...prev, high: value }));
                        setEQ("A", "highshelf", value);
                      }}
                    />
                  </div>
                </div>
                <label className="file">
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => loadTrack("A", e.target.files?.[0] ?? null)}
                  />
                  Load Track
                </label>
              </div>
              <div className="fx-strip">
                <span className="fx-title">FX A</span>
                <div className="fx-preset">
                  <select
                    onChange={(e) => applyFxPreset("A", e.target.value)}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Preset FX
                    </option>
                    {fxPresetsA.map((preset) => (
                      <option key={preset.name} value={preset.name}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Nombre preset"
                    value={fxPresetNameA}
                    onChange={(e) => setFxPresetNameA(e.target.value)}
                  />
                  <button className="ghost" onClick={() => saveFxPreset("A")}>
                    Guardar
                  </button>
                </div>
                <div className="fx-row">
                  <button
                    className={fxA.reverb ? "active" : ""}
                    onClick={() => toggleFx("A", "reverb")}
                  >
                    Reverb
                  </button>
                  <div
                    className="knob-shell fx"
                    style={{
                      ["--knob-rot" as any]: `${wetA.reverb * 270 - 135}deg`,
                      ["--knob-fill" as any]: `${wetA.reverb * 100}%`,
                    }}
                  >
                    <div className="knob-dial" />
                    <input
                      className="knob-input"
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(wetA.reverb * 100)}
                      onChange={(e) =>
                        setWetA((prev) => ({
                          ...prev,
                          reverb: Number(e.target.value) / 100,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="fx-row">
                  <button
                    className={fxA.delay ? "active" : ""}
                    onClick={() => toggleFx("A", "delay")}
                  >
                    Delay
                  </button>
                  <div
                    className="knob-shell fx"
                    style={{
                      ["--knob-rot" as any]: `${wetA.delay * 270 - 135}deg`,
                      ["--knob-fill" as any]: `${wetA.delay * 100}%`,
                    }}
                  >
                    <div className="knob-dial" />
                    <input
                      className="knob-input"
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(wetA.delay * 100)}
                      onChange={(e) =>
                        setWetA((prev) => ({
                          ...prev,
                          delay: Number(e.target.value) / 100,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="fx-row">
                  <button
                    className={fxA.filter ? "active" : ""}
                    onClick={() => toggleFx("A", "filter")}
                  >
                    Filter
                  </button>
                  <div
                    className="knob-shell fx"
                    style={{
                      ["--knob-rot" as any]: `${wetA.filter * 270 - 135}deg`,
                      ["--knob-fill" as any]: `${wetA.filter * 100}%`,
                    }}
                  >
                    <div className="knob-dial" />
                    <input
                      className="knob-input"
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(wetA.filter * 100)}
                      onChange={(e) =>
                        setWetA((prev) => ({
                          ...prev,
                          filter: Number(e.target.value) / 100,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="fx-row">
                  <button
                    className={fxA.gate ? "active" : ""}
                    onClick={() => toggleFx("A", "gate")}
                  >
                    Gate
                  </button>
                  <div
                    className="knob-shell fx"
                    style={{
                      ["--knob-rot" as any]: `${wetA.gate * 270 - 135}deg`,
                      ["--knob-fill" as any]: `${wetA.gate * 100}%`,
                    }}
                  >
                    <div className="knob-dial" />
                    <input
                      className="knob-input"
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(wetA.gate * 100)}
                      onChange={(e) =>
                        setWetA((prev) => ({
                          ...prev,
                          gate: Number(e.target.value) / 100,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="deck glass reveal delay-2">
            <div className="deck-light b" />
            <div className="deck-head">
              <span className="deck-label">
                Deck B
                <button
                  className={`arm-btn ${armedB ? "active" : ""}`}
                  onClick={() => {
                    setArmedB((prev) => !prev);
                    playClick();
                  }}
                >
                  Arm
                </button>
                <span
                  className={`beat-led b ${bpmB ? "pulse" : ""}`}
                  style={{ ["--beat-ms" as any]: bpmB ? `${60000 / bpmB}ms` : "600ms" }}
                />
              </span>
              <span className="deck-track">
                {deckBTrackName ?? "Neon Skyline"}
                <span className="deck-bpm">
                  {bpmB ? `${bpmB} BPM` : "BPM --"}
                </span>
              </span>
            </div>
            <div className="waveform">
              <div className="wave-grid" />
              {beatSize(bpmB, durationB) && (
                <div
                  className="beat-grid"
                  style={{
                    ["--beat-size" as any]: `${beatSize(bpmB, durationB)}%`,
                    ["--bar-size" as any]: `${(beatSize(bpmB, durationB) ?? 0) * 4}%`,
                  }}
                />
              )}
              {beatSize(bpmB, durationB) && (
                <div
                  className="downbeat-grid"
                  style={{
                    ["--bar-size" as any]: `${(beatSize(bpmB, durationB) ?? 0) * 4}%`,
                  }}
                />
              )}
              <div className="wave-canvas" ref={deckBRef} />
            </div>
            <div className="deck-controls">
              <button
                className="chip ghost"
                onClick={() => {
                  playClick();
                }}
              >
                <span className="icon-cue" />
                Cue
              </button>
              <button
                className={`play-btn ${deckBPlaying ? "active" : ""}`}
                onClick={() => togglePlay("B")}
              >
                <span className={deckBPlaying ? "icon-pause" : "icon-play"} />
                {deckBPlaying ? "Pause" : "Play"}
              </button>
              <button className="chip" onClick={() => syncTempo("B")}>
                <span className="icon-sync" />
                Sync
              </button>
              <button className="chip ghost" onClick={() => tapTempo("B")}>
                Tap
              </button>
              <div className="fader">
                <span>Tempo</span>
                <div
                  className="knob-shell tempo"
                  style={{
                    ["--knob-rot" as any]: `${((tempoB - 0.6) / 0.9) * 270 - 135}deg`,
                    ["--knob-fill" as any]: `${((tempoB - 0.6) / 0.9) * 100}%`,
                  }}
                >
                  <div className="knob-dial" />
                  <input
                    className="knob-input"
                    type="range"
                    min="0.6"
                    max="1.5"
                    step="0.01"
                    value={tempoB}
                    onChange={(e) => setTempo("B", Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="knobs">
                <div className="knob">
                  <span>Low</span>
                  <div
                    className="knob-shell"
                    style={{
                      ["--knob-rot" as any]: `${((eqB.low + 12) / 24) * 270 - 135}deg`,
                      ["--knob-fill" as any]: `${((eqB.low + 12) / 24) * 100}%`,
                    }}
                  >
                    <div className="knob-dial" />
                    <input
                      className="knob-input"
                      type="range"
                      min="-12"
                      max="12"
                      value={eqB.low}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setEqB((prev) => ({ ...prev, low: value }));
                        setEQ("B", "lowshelf", value);
                      }}
                    />
                  </div>
                </div>
                <div className="knob">
                  <span>Mid</span>
                  <div
                    className="knob-shell"
                    style={{
                      ["--knob-rot" as any]: `${((eqB.mid + 12) / 24) * 270 - 135}deg`,
                      ["--knob-fill" as any]: `${((eqB.mid + 12) / 24) * 100}%`,
                    }}
                  >
                    <div className="knob-dial" />
                    <input
                      className="knob-input"
                      type="range"
                      min="-12"
                      max="12"
                      value={eqB.mid}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setEqB((prev) => ({ ...prev, mid: value }));
                        setEQ("B", "peaking", value);
                      }}
                    />
                  </div>
                </div>
                <div className="knob">
                  <span>High</span>
                  <div
                    className="knob-shell"
                    style={{
                      ["--knob-rot" as any]: `${((eqB.high + 12) / 24) * 270 - 135}deg`,
                      ["--knob-fill" as any]: `${((eqB.high + 12) / 24) * 100}%`,
                    }}
                  >
                    <div className="knob-dial" />
                    <input
                      className="knob-input"
                      type="range"
                      min="-12"
                      max="12"
                      value={eqB.high}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setEqB((prev) => ({ ...prev, high: value }));
                        setEQ("B", "highshelf", value);
                      }}
                    />
                  </div>
                </div>
                <label className="file">
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => loadTrack("B", e.target.files?.[0] ?? null)}
                  />
                  Load Track
                </label>
              </div>
              <div className="fx-strip">
                <span className="fx-title">FX B</span>
                <div className="fx-preset">
                  <select
                    onChange={(e) => applyFxPreset("B", e.target.value)}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Preset FX
                    </option>
                    {fxPresetsB.map((preset) => (
                      <option key={preset.name} value={preset.name}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Nombre preset"
                    value={fxPresetNameB}
                    onChange={(e) => setFxPresetNameB(e.target.value)}
                  />
                  <button className="ghost" onClick={() => saveFxPreset("B")}>
                    Guardar
                  </button>
                </div>
                <div className="fx-row">
                  <button
                    className={fxB.reverb ? "active" : ""}
                    onClick={() => toggleFx("B", "reverb")}
                  >
                    Reverb
                  </button>
                  <div
                    className="knob-shell fx"
                    style={{
                      ["--knob-rot" as any]: `${wetB.reverb * 270 - 135}deg`,
                      ["--knob-fill" as any]: `${wetB.reverb * 100}%`,
                    }}
                  >
                    <div className="knob-dial" />
                    <input
                      className="knob-input"
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(wetB.reverb * 100)}
                      onChange={(e) =>
                        setWetB((prev) => ({
                          ...prev,
                          reverb: Number(e.target.value) / 100,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="fx-row">
                  <button
                    className={fxB.delay ? "active" : ""}
                    onClick={() => toggleFx("B", "delay")}
                  >
                    Delay
                  </button>
                  <div
                    className="knob-shell fx"
                    style={{
                      ["--knob-rot" as any]: `${wetB.delay * 270 - 135}deg`,
                      ["--knob-fill" as any]: `${wetB.delay * 100}%`,
                    }}
                  >
                    <div className="knob-dial" />
                    <input
                      className="knob-input"
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(wetB.delay * 100)}
                      onChange={(e) =>
                        setWetB((prev) => ({
                          ...prev,
                          delay: Number(e.target.value) / 100,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="fx-row">
                  <button
                    className={fxB.filter ? "active" : ""}
                    onClick={() => toggleFx("B", "filter")}
                  >
                    Filter
                  </button>
                  <div
                    className="knob-shell fx"
                    style={{
                      ["--knob-rot" as any]: `${wetB.filter * 270 - 135}deg`,
                      ["--knob-fill" as any]: `${wetB.filter * 100}%`,
                    }}
                  >
                    <div className="knob-dial" />
                    <input
                      className="knob-input"
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(wetB.filter * 100)}
                      onChange={(e) =>
                        setWetB((prev) => ({
                          ...prev,
                          filter: Number(e.target.value) / 100,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="fx-row">
                  <button
                    className={fxB.gate ? "active" : ""}
                    onClick={() => toggleFx("B", "gate")}
                  >
                    Gate
                  </button>
                  <div
                    className="knob-shell fx"
                    style={{
                      ["--knob-rot" as any]: `${wetB.gate * 270 - 135}deg`,
                      ["--knob-fill" as any]: `${wetB.gate * 100}%`,
                    }}
                  >
                    <div className="knob-dial" />
                    <input
                      className="knob-input"
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(wetB.gate * 100)}
                      onChange={(e) =>
                        setWetB((prev) => ({
                          ...prev,
                          gate: Number(e.target.value) / 100,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="mixer glass reveal delay-3">
          <div className="mixer-head">
            <span>Mixer</span>
            <span className="caps">Studio Clean</span>
          </div>
          <div className="meters">
            <div className="meter" ref={meterARef}>
              <div className="meter-fill" />
            </div>
            <div className="meter" ref={meterBRef}>
              <div className="meter-fill alt" />
            </div>
          </div>
          <div className="spectrum">
            {Array.from({ length: SPECTRUM_BARS }).map((_, i) => (
              <span
                key={`bar-${i}`}
                ref={(el) => {
                  if (el) spectrumBarsRef.current[i] = el;
                }}
              />
            ))}
          </div>
          <div className="mixer-controls">
            <div className="crossfader">
              <span>Crossfader</span>
              <div
                className="knob-shell master"
                style={{
                  ["--knob-rot" as any]: `${(crossfader / 100) * 270 - 135}deg`,
                  ["--knob-fill" as any]: `${crossfader}%`,
                }}
              >
                <div className="knob-dial" />
                <input
                  className="knob-input"
                  type="range"
                  min="0"
                  max="100"
                  value={crossfader}
                  onChange={(e) => setCrossfader(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="record">
              <span>Mix Recorder</span>
              <div className="record-row">
                <button
                  className={recording ? "active" : ""}
                  onClick={toggleRecord}
                >
                  {recording ? "Stop" : "Record"}
                </button>
                {recordedUrl && (
                  <a className="ghost" href={recordedUrl} download="mix.webm">
                    Download
                  </a>
                )}
              </div>
            </div>
            <div className="master">
              <span>Master</span>
              <div
                className="knob-shell master"
                style={{
                  ["--knob-rot" as any]: `${(master / 100) * 270 - 135}deg`,
                  ["--knob-fill" as any]: `${master}%`,
                }}
              >
                <div className="knob-dial" />
                <input
                  className="knob-input"
                  type="range"
                  min="0"
                  max="100"
                  value={master}
                  onChange={(e) => setMaster(Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section className="library glass reveal delay-4">
        <div className="library-head">
          <span>Library</span>
          <div className="search">
            <input type="text" placeholder="Search tracks, artists, BPM..." />
          </div>
          <button className="ghost">Import</button>
        </div>
        <div className="library-body">
          <div className="track">
            <div>
              <strong>Pulse Station</strong>
              <span>Nova Reed • 122 BPM</span>
            </div>
            <button className="ghost">Load A</button>
          </div>
          <div className="track">
            <div>
              <strong>Afterglow</strong>
              <span>Analog Bloom • 124 BPM</span>
            </div>
            <button className="ghost">Load B</button>
          </div>
          <div className="track">
            <div>
              <strong>Cold Lines</strong>
              <span>Silent Park • 126 BPM</span>
            </div>
            <button className="ghost">Load A</button>
          </div>
          <div className="track">
            <div>
              <strong>Silver Echo</strong>
              <span>Isla Verve • 120 BPM</span>
            </div>
            <button className="ghost">Load B</button>
          </div>
        </div>
        <div className="midi-panel">
          <div className="midi-head">
            <span>MIDI Mapping</span>
            <span className="caps">{midiStatus}</span>
          </div>
          <div className="midi-grid">
            <label>
              Deck A Play (Note)
              <input
                type="number"
                value={midiMap.deckAPlay}
                onChange={(e) =>
                  setMidiMap((prev) => ({
                    ...prev,
                    deckAPlay: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label>
              Deck B Play (Note)
              <input
                type="number"
                value={midiMap.deckBPlay}
                onChange={(e) =>
                  setMidiMap((prev) => ({
                    ...prev,
                    deckBPlay: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label>
              Crossfader (CC)
              <input
                type="number"
                value={midiMap.crossfader}
                onChange={(e) =>
                  setMidiMap((prev) => ({
                    ...prev,
                    crossfader: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label>
              Master (CC)
              <input
                type="number"
                value={midiMap.master}
                onChange={(e) =>
                  setMidiMap((prev) => ({
                    ...prev,
                    master: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label>
              FX A Reverb (Note)
              <input
                type="number"
                value={midiMap.fxAReverb}
                onChange={(e) =>
                  setMidiMap((prev) => ({
                    ...prev,
                    fxAReverb: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label>
              FX A Delay (Note)
              <input
                type="number"
                value={midiMap.fxADelay}
                onChange={(e) =>
                  setMidiMap((prev) => ({
                    ...prev,
                    fxADelay: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label>
              FX A Filter (Note)
              <input
                type="number"
                value={midiMap.fxAFilter}
                onChange={(e) =>
                  setMidiMap((prev) => ({
                    ...prev,
                    fxAFilter: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label>
              FX A Gate (Note)
              <input
                type="number"
                value={midiMap.fxAGate}
                onChange={(e) =>
                  setMidiMap((prev) => ({
                    ...prev,
                    fxAGate: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label>
              FX B Reverb (Note)
              <input
                type="number"
                value={midiMap.fxBReverb}
                onChange={(e) =>
                  setMidiMap((prev) => ({
                    ...prev,
                    fxBReverb: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label>
              FX B Delay (Note)
              <input
                type="number"
                value={midiMap.fxBDelay}
                onChange={(e) =>
                  setMidiMap((prev) => ({
                    ...prev,
                    fxBDelay: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label>
              FX B Filter (Note)
              <input
                type="number"
                value={midiMap.fxBFilter}
                onChange={(e) =>
                  setMidiMap((prev) => ({
                    ...prev,
                    fxBFilter: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label>
              FX B Gate (Note)
              <input
                type="number"
                value={midiMap.fxBGate}
                onChange={(e) =>
                  setMidiMap((prev) => ({
                    ...prev,
                    fxBGate: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label>
              Record Toggle (Note)
              <input
                type="number"
                value={midiMap.recordToggle}
                onChange={(e) =>
                  setMidiMap((prev) => ({
                    ...prev,
                    recordToggle: Number(e.target.value),
                  }))
                }
              />
            </label>
          </div>
        </div>
      </section>

      <footer className="footer">
        <img src={logoUrl} alt="AmarcordDJ" />
        <span>© 2026 AmarcordDJ.</span>
        <span>By Jose Álvarez Dev.</span>
        <button className="license-btn" onClick={() => setLicenseOpen(true)}>
          MIT License.
        </button>
      </footer>
            </>
          }
        />
        <Route
          path="/guide"
          element={
            <section className="guide-page glass reveal">
              <div className="guide-head">
                <span>AmarcordDJ Guide</span>
                <button
                  className="ghost"
                  onClick={() => {
                    window.location.hash = "#/";
                    goHome();
                  }}
                >
                  Close
                </button>
              </div>
              <div className="guide-content">
                <p className="guide-intro">
                  AmarcordDJ is a professional two‑deck mixing environment built for quick
                  performance. This guide covers the essentials, from loading tracks to exporting
                  your mix.
                </p>
                <h3>Getting Started</h3>
                <ol>
                  <li>Load a track on Deck A and Deck B.</li>
                  <li>Press Play to start each deck.</li>
                  <li>Use the Crossfader to blend both decks.</li>
                </ol>
                <h3>Track Loading</h3>
                <ol>
                  <li>Use “Load Track” on each deck to choose local audio files.</li>
                  <li>Supported formats depend on your OS codec support.</li>
                  <li>After loading, BPM and beatgrid are analyzed automatically.</li>
                </ol>
                <h3>Performance Controls</h3>
                <ol>
                  <li>Use Sync to match tempos.</li>
                  <li>Tap to set BPM if needed.</li>
                  <li>Adjust EQ and FX knobs per deck.</li>
                </ol>
                <h3>EQ & FX</h3>
                <ol>
                  <li>Use Low, Mid, High knobs to sculpt the mix.</li>
                  <li>Enable FX with the button, then adjust the wet/dry knob.</li>
                  <li>Save FX presets per deck for quick recall.</li>
                </ol>
                <h3>Beatgrid & Sync</h3>
                <ol>
                  <li>Beatgrid lines are based on detected BPM.</li>
                  <li>Sync uses BPM ratio to align tempos between decks.</li>
                  <li>Tap Tempo is useful when detection is off.</li>
                </ol>
                <h3>Recording</h3>
                <ol>
                  <li>Press Record to capture your mix.</li>
                  <li>Download the file when finished.</li>
                </ol>
                <h3>MIDI</h3>
                <ol>
                  <li>Connect a MIDI controller before launching the app.</li>
                  <li>Open MIDI Mapping to assign buttons and CCs.</li>
                  <li>Changes are saved in the local settings store.</li>
                </ol>
                <h3>Settings & Sessions</h3>
                <ol>
                  <li>Toggle Dark Mode and Beat Snap in Settings.</li>
                  <li>Save/Load sessions to recall mixer state and preferences.</li>
                  <li>Export/Import settings to move configs between machines.</li>
                </ol>
                <h3>Tips</h3>
                <ol>
                  <li>Keep Master below clipping and use meters as reference.</li>
                  <li>Blend using EQ cuts instead of volume only.</li>
                  <li>Save presets for different genres and tempos.</li>
                </ol>
              </div>
            </section>
          }
        />
      </Routes>

      {settingsOpen && (
        <div className="drawer">
          <div className="drawer-panel glass">
            <div className="drawer-head">
              <span>Ajustes</span>
              <button className="ghost" onClick={() => setSettingsOpen(false)}>
                Cerrar
              </button>
            </div>
            <div className="drawer-body">
              <div className="toggle-row">
                <span>Modo Oscuro</span>
                <button
                  className={darkMode ? "active" : ""}
                  onClick={() => setDarkMode((prev) => !prev)}
                >
                  {darkMode ? "On" : "Off"}
                </button>
              </div>
              <div className="toggle-row">
                <span>Beat Snap</span>
                <button
                  className={beatSnap ? "active" : ""}
                  onClick={() => setBeatSnap((prev) => !prev)}
                >
                  {beatSnap ? "On" : "Off"}
                </button>
              </div>
              <div className="preset-block">
                <span>Presets MIDI</span>
                <div className="preset-row">
                  <select onChange={(e) => applyPreset(e.target.value)} defaultValue="">
                    <option value="" disabled>
                      Seleccionar preset
                    </option>
                    {presets.map((preset) => (
                      <option key={preset.name} value={preset.name}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Nombre del preset"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                  />
                  <button className="ghost" onClick={savePreset}>
                    Guardar
                  </button>
                </div>
              </div>
              <div className="preset-block">
                <span>Sesiones</span>
                <div className="preset-row">
                  <select onChange={(e) => loadSession(e.target.value)} defaultValue="">
                    <option value="" disabled>
                      Cargar sesión
                    </option>
                    {sessions.map((session) => (
                      <option key={session.name} value={session.name}>
                        {session.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Nombre de sesión"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                  />
                  <button className="ghost" onClick={saveSession}>
                    Guardar sesión
                  </button>
                </div>
                <div className="session-list">
                  {sessions.map((session) => (
                    <div key={session.name} className="session-item">
                      <span>{session.name}</span>
                      <span className="caps">{session.savedAt.split("T")[0]}</span>
                      <button className="ghost" onClick={() => loadSession(session.name)}>
                        Cargar
                      </button>
                      <button className="ghost" onClick={() => deleteSession(session.name)}>
                        Borrar
                      </button>
                    </div>
                  ))}
                </div>
                <p className="hint">
                  Las sesiones guardan estado y preferencias, no los archivos de audio.
                </p>
              </div>
              <div className="preset-actions">
                <label className="file">
                  <input
                    type="file"
                    accept="application/json"
                    onChange={(e) => importSettings(e.target.files?.[0] ?? null)}
                  />
                  Importar ajustes
                </label>
                <button className="ghost" onClick={exportSettings}>
                  Exportar ajustes
                </button>
                <button className="ghost" onClick={resetPreferences}>
                  Reset a default
                </button>
              </div>
              <div className="guide">
                <h3>Guía rápida</h3>
                <ul>
                  <li>1. Carga un audio por deck con “Load Track”.</li>
                  <li>2. Play/Pause controla cada deck y el crossfader mezcla.</li>
                  <li>3. Ajusta FX por deck con su wet/dry.</li>
                  <li>4. Beatgrid y BPM se calculan al cargar el track.</li>
                  <li>5. Usa el panel MIDI para mapear controles.</li>
                  <li>6. Graba el mix desde “Mix Recorder”.</li>
                </ul>
              </div>
              <p className="hint">
                Preferencias guardadas localmente en este dispositivo.
              </p>
            </div>
          </div>
          <button
            className="drawer-scrim"
            aria-label="Cerrar ajustes"
            onClick={() => setSettingsOpen(false)}
          />
        </div>
      )}

      {licenseOpen && (
        <div className="license-modal">
          <div className="license-card glass">
            <div className="license-head">
              <span>MIT License</span>
              <button className="ghost" onClick={() => setLicenseOpen(false)}>
                Close
              </button>
            </div>
            <div className="license-body">
              <img src={logoUrl} alt="AmarcordDJ" />
              <p>AmarcordDJ is released under the MIT License.</p>
              <div className="license-text">
                <p>MIT License</p>
                <p>Copyright (c) 2026 AmarcordDJ</p>
                <p>
                  Permission is hereby granted, free of charge, to any person obtaining a copy
                  of this software and associated documentation files (the "Software"), to deal
                  in the Software without restriction, including without limitation the rights
                  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
                  copies of the Software, and to permit persons to whom the Software is
                  furnished to do so, subject to the following conditions:
                </p>
                <p>
                  The above copyright notice and this permission notice shall be included in all
                  copies or substantial portions of the Software.
                </p>
                <p>
                  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
                  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
                  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
                  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
                  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
                  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
                  SOFTWARE.
                </p>
              </div>
            </div>
          </div>
          <button
            className="license-scrim"
            aria-label="Close license"
            onClick={() => setLicenseOpen(false)}
          />
        </div>
      )}

    </div>
  );
}

export default App;
