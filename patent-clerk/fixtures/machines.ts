// Hand-written machines in the shape the clerk files. Used by scripts/render-fixtures.ts
// to exercise the renderer without an API key, and by the offline demo clerk.
import type { Machine } from "../lib/machine/schema";

export const FIXTURES: Record<string, Machine> = {
  regret: {
    title: "Apparatus for the Distillation of Mild Regret",
    inventor: "Eleanor P. Whitcombe",
    abstract:
      "An apparatus whereby mild regret, introduced by way of a funnel, is heated in a boiler, condensed, and collected in a glass jar for later contemplation. A gauge indicates the prevailing pressure of remorse, and a chimney discharges such sighs as are produced.",
    claims: [
      "An apparatus for the distillation of mild regret, comprising: a boiler; a funnel communicating with said boiler; and a glass jar receiving the condensate therefrom.",
      "The apparatus of claim 1, wherein a gauge indicates the pressure of remorse within said boiler.",
      "The apparatus of claim 1, further comprising a chimney for the discharge of sighs.",
    ],
    parts: [
      { id: "b", type: "boiler", size: "large", label: "Regret Boiler" },
      { id: "f", type: "funnel", size: "medium", label: "Intake Funnel" },
      { id: "c", type: "chimney", size: "medium", label: "Sigh Stack" },
      { id: "g", type: "gauge", size: "small", label: "Remorse Gauge" },
      { id: "v", type: "valve", size: "medium", label: "Condensate Valve" },
      { id: "j", type: "glass_jar", size: "medium", label: "Collecting Jar" },
    ],
    connections: [
      { from: "f", to: "b", kind: "pipe", label: "" },
      { from: "b", to: "c", kind: "pipe", label: "Flue" },
      { from: "b", to: "g", kind: "pipe", label: "" },
      { from: "b", to: "v", kind: "pipe", label: "Condenser Line" },
      { from: "v", to: "j", kind: "pipe", label: "" },
    ],
  },
  sock: {
    title: "Improved Engine for the Reunification of Lost Socks",
    inventor: "Thaddeus Q. Ambrose",
    abstract:
      "A mechanical engine in which socks of uncertain pairing are conveyed past a sorting lever, agitated by a spring, and matched by means of a gear train driven by a hand crank. Unmatched socks are returned by bellows to the hamper for further reflection.",
    claims: [
      "An engine for the reunification of lost socks, comprising: a conveyor; a sorting lever disposed above said conveyor; and a gear train driven by a crank.",
      "The engine of claim 1, wherein a spring agitates each sock prior to sorting.",
      "The engine of claim 1, wherein bellows return unmatched socks to a hamper.",
      "The engine of claim 2, wherein a flywheel stores the momentum of the operator's optimism.",
    ],
    parts: [
      { id: "conv", type: "conveyor", size: "large", label: "Sock Conveyor" },
      { id: "g1", type: "gear", size: "medium", label: "Matching Gear" },
      { id: "g2", type: "gear", size: "small", label: "Idler Gear" },
      { id: "cr", type: "crank", size: "medium", label: "Hand Crank" },
      { id: "lv", type: "lever", size: "medium", label: "Sorting Lever" },
      { id: "sp", type: "spring", size: "small", label: "Agitator Spring" },
      { id: "bw", type: "bellows", size: "medium", label: "Return Bellows" },
      { id: "fw", type: "flywheel", size: "medium", label: "Optimism Flywheel" },
      { id: "t", type: "tank", size: "small", label: "Hamper Tank" },
    ],
    connections: [
      { from: "cr", to: "g1", kind: "shaft", label: "" },
      { from: "g1", to: "g2", kind: "belt", label: "Drive Belt" },
      { from: "g2", to: "conv", kind: "chain", label: "" },
      { from: "lv", to: "conv", kind: "wire", label: "" },
      { from: "sp", to: "lv", kind: "shaft", label: "" },
      { from: "bw", to: "t", kind: "pipe", label: "Return Duct" },
      { from: "conv", to: "bw", kind: "pipe", label: "" },
      { from: "fw", to: "g1", kind: "belt", label: "" },
    ],
  },
  weather: {
    title: "Pneumatic Device for the Prediction of Tuesday",
    inventor: "Marguerite Okonkwo-Hale",
    abstract:
      "A pneumatic device which, by the compression of ordinary air within a piston and its release through a horn, announces the approach of Tuesday with suitable solemnity. A spring-loaded valve regulates the interval between announcements.",
    claims: [
      "A pneumatic device for the prediction of Tuesday, comprising: a piston; a horn in communication with said piston; and a valve regulating the passage of air therebetween.",
      "The device of claim 1, wherein a spring returns said piston after each announcement.",
    ],
    parts: [
      { id: "p", type: "piston", size: "large", label: "Compression Piston" },
      { id: "h", type: "horn", size: "large", label: "Announcing Horn" },
      { id: "v", type: "valve", size: "medium", label: "Interval Valve" },
      { id: "s", type: "spring", size: "medium", label: "Return Spring" },
      { id: "g", type: "gauge", size: "medium", label: "Tuesday Indicator" },
    ],
    connections: [
      { from: "p", to: "v", kind: "pipe", label: "Air Main" },
      { from: "v", to: "h", kind: "pipe", label: "" },
      { from: "s", to: "p", kind: "shaft", label: "" },
      { from: "g", to: "v", kind: "pipe", label: "" },
    ],
  },
  max: {
    title: "Universal Contrivance for the Conversion of Mondays into Small Victories by Means of Steam",
    inventor: "Professor Augustina Fennimore-Blackwood III",
    abstract:
      "A universal contrivance comprising a plurality of boilers, tanks, gears and conveyors arranged such that the latent dread of Mondays is converted, by means of steam, into a series of small victories of modest but measurable size, each of which is deposited in a glass jar and announced by horn to the household at large, while surplus dread is vented harmlessly by chimney.",
    claims: [
      "A contrivance for the conversion of Mondays into small victories, comprising: a boiler for the vaporization of dread; a tank for the storage thereof; a gear train; a conveyor; and a glass jar for the collection of victories, all operatively connected such that dread entering said boiler emerges from said conveyor as victories.",
      "The contrivance of claim 1, further comprising a horn for the announcement of each victory to the household at large, and a gauge indicating the prevailing level of dread.",
      "The contrivance of claim 1, wherein a chimney vents surplus dread to the atmosphere, and a valve meters the passage of steam to said gear train.",
      "The contrivance of claim 3, wherein a flywheel and crank are provided for operation on mornings when steam is not available.",
    ],
    parts: [
      { id: "b", type: "boiler", size: "large", label: "Dread Boiler" },
      { id: "t", type: "tank", size: "medium", label: "Dread Reservoir" },
      { id: "g", type: "gear", size: "medium", label: "Primary Gear" },
      { id: "fw", type: "flywheel", size: "medium", label: "Flywheel" },
      { id: "cv", type: "conveyor", size: "medium", label: "Victory Conveyor" },
      { id: "j", type: "glass_jar", size: "small", label: "Victory Jar" },
      { id: "h", type: "horn", size: "small", label: "Herald Horn" },
      { id: "c", type: "chimney", size: "medium", label: "Vent Stack" },
      { id: "v", type: "valve", size: "small", label: "Steam Valve" },
      { id: "ga", type: "gauge", size: "small", label: "Dread Gauge" },
      { id: "p", type: "piston", size: "medium", label: "Power Piston" },
      { id: "cr", type: "crank", size: "small", label: "Emergency Crank" },
    ],
    connections: [
      { from: "t", to: "b", kind: "pipe", label: "Feed Line" },
      { from: "b", to: "c", kind: "pipe", label: "" },
      { from: "b", to: "v", kind: "pipe", label: "Steam Main" },
      { from: "v", to: "p", kind: "pipe", label: "" },
      { from: "p", to: "g", kind: "shaft", label: "Connecting Rod" },
      { from: "g", to: "fw", kind: "belt", label: "" },
      { from: "cr", to: "fw", kind: "shaft", label: "" },
      { from: "g", to: "cv", kind: "chain", label: "" },
      { from: "cv", to: "j", kind: "wire", label: "" },
      { from: "j", to: "h", kind: "pipe", label: "" },
      { from: "ga", to: "b", kind: "pipe", label: "" },
    ],
  },
};
