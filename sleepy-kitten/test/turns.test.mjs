// node test/turns.test.mjs : turn-taking logic, driven by the real detector on synthetic audio.
import { KittenBrain } from "../turns.mjs";
import { VoiceDetector } from "../detector.mjs";
import * as S from "./signals.mjs";

let failures = 0;
const check = (ok, msg) => { console.log((ok ? "  PASS " : "  FAIL ") + msg); if (!ok) failures++; };
const dad = (sec) => S.voice(sec, { f0: 115, db: -26 });
const liam = (sec) => S.voice(sec, { f0: 380, db: -28, formants: [900, 1700, 3000] });
const gap = (sec) => S.silence(sec, -62);

function play(signal, opts = {}, holdSpans = []) {
  const d = new VoiceDetector(S.SR); d.setFloor(-71);
  const b = new KittenBrain(opts); b.start(0);
  const log = [];
  let prev = b.state;
  for (let i = 0; i < signal.length; i += 128) {
    for (const r of d.process(signal.subarray(i, i + 128))) {
      b.setHold(holdSpans.some(([a, z]) => r.t >= a && r.t <= z));
      for (const ev of [r.event, r.event2]) {
        if (!ev) continue;
        if (ev.type === "onset") log.push({ t: r.t, who: b.onOnset(r.t), lat: r.t - ev.t });
        if (ev.type === "end") b.onEnd(ev.t, ev.duration);
      }
      b.tick(r.t);
      if (b.state !== prev) { log.push({ t: r.t, state: b.state, glow: b.glow, pose: b.pose() }); prev = b.state; }
    }
  }
  return { b, log };
}
const whos = (log) => log.filter((l) => l.who).map((l) => l.who).join(",");
const states = (log) => log.filter((l) => l.state).map((l) => l.state).join(">");

console.log("Turn-taking mode (default):");
{
  // Dad: "shhh kitty's sleeping ... (0.5 s pause) ... hellooo!"  then 3 s wait, Liam "aaah" 1.5 s,
  // 4 s later Dad models again, 2 s later Liam "ba" 0.3 s, then 20 s quiet.
  const sig = S.concat(gap(1), dad(0.9), gap(0.5), dad(0.7), gap(3), liam(1.5), gap(4), dad(1.0), gap(2), liam(0.3), gap(20));
  const { b, log } = play(sig);
  check(whos(log) === "dad,dad,liam,dad,liam", `speakers: ${whos(log)}`);
  check(states(log).startsWith("stir>wait>stir>wait>wake>happy>idle>stir>wait>wake>happy>idle>settle>sleep"), `states: ${states(log)}`);
  const waitLog = log.find((l) => l.state === "wait");
  check(waitLog && waitLog.glow === true && waitLog.pose === "waiting", "after Dad's model the kitten waits with the glow (waiting pose)");
  check(log.filter((l) => l.who).every((l) => l.lat < 0.1), `every onset reacts < 100 ms (max ${Math.max(...log.filter((l) => l.who).map((l) => l.lat * 1000)).toFixed(0)} ms)`);
  const settle = log.find((l) => l.state === "settle"), sleep = log.find((l) => l.state === "sleep");
  check(settle && sleep && sleep.t - settle.t >= 2.9, `settles slowly back to sleep (${(sleep.t - settle.t).toFixed(1)} s), never snaps`);
  check(b.stats.liamSounds === 2 && Math.abs(b.stats.longest - 1.5) < 0.1, `parent stats: ${b.stats.liamSounds} sounds, longest ${b.stats.longest.toFixed(2)} s`);
}

console.log("Longer reply = bigger reward:");
{
  const short = play(S.concat(gap(1), dad(0.8), gap(2), liam(0.3), gap(1))).b.reward;
  const long = play(S.concat(gap(1), dad(0.8), gap(2), liam(2.2), gap(1))).b.reward;
  check(short && long && long.size > short.size && long.hop && !short.hop, `0.3 s -> size ${short?.size.toFixed(2)}; 2.2 s -> size ${long?.size.toFixed(2)} + hop`);
}

console.log("Claps during Liam's turn don't count:");
{
  const sig = S.concat(gap(1), dad(0.8), gap(2), S.clap(-6), gap(1), S.knock(-8), gap(1));
  const { log } = play(sig);
  check(whos(log) === "dad" && !states(log).includes("wake"), `speakers: ${whos(log)}; states: ${states(log)}`);
}

console.log("Hold-for-Dad mode:");
{
  // Dad holds the screen 1.0-2.2 s while talking; Liam answers quickly (0.3 s after) and again.
  const sig = S.concat(gap(1), dad(1.0), gap(0.3), liam(0.6), gap(0.5), liam(0.6), gap(2));
  const { log } = play(sig, { mode: "hold" }, [[0.9, 2.15]]);
  check(whos(log) === "dad,liam,liam", `speakers: ${whos(log)} (quick replies still count for Liam)`);
}

console.log("Any-voice mode:");
{
  const { log } = play(S.concat(gap(1), dad(0.8), gap(2), liam(0.5), gap(2)), { mode: "any" });
  check(whos(log) === "liam,liam", `every voice rewarded: ${whos(log)}`);
}

console.log("Session end:");
{
  const sig = S.concat(gap(1), dad(0.8), gap(2), liam(1.0), gap(10));
  const { b, log } = play(sig, { sessionSec: 4 });
  const curl = log.find((l) => l.state === "curl"), happy = log.find((l) => l.state === "happy");
  check(curl && happy && curl.t > happy.t + b.reward.holdSec - 0.25, `waits for the happy wiggle to finish, then curls up (${states(log)})`);
  check(b.state === "done" && b.listening === false && b.pose() === "sleeping", "falls asleep and stops listening");
  check(b.onOnset(15) === null, "no reaction after the session ends");
}

console.log(failures ? `\n${failures} FAILED` : "\nAll turn tests passed");
process.exit(failures ? 1 : 0);
