(function () {
        "use strict";
        var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        /* ---------- theme toggle ----------
           Dark is the default and stays until the visitor toggles: the page
           never follows the OS colour scheme on its own. */
        function currentTheme() {
          var t = document.documentElement.getAttribute("data-theme");
          return t === "light" ? "light" : "dark";
        }
        function toggleTheme() {
          document.documentElement.setAttribute("data-theme", currentTheme() === "dark" ? "light" : "dark");
        }
        document.getElementById("theme-btn").addEventListener("click", toggleTheme);
        document.getElementById("theme-btn-m").addEventListener("click", toggleTheme);

        /* ---------- soundtrack: generative futuristic synth loop ----------
           No audio file: the track is synthesised live with Web Audio —
           detuned saw pads drifting through an A-minor progression, a sine
           sub-bass, and a plucked arpeggio echoing through a generated
           reverb. Chords crossfade and the scheduler looks ahead, so the
           loop is seamless and plays indefinitely. */
        var soundBtns = document.querySelectorAll(".sound-btn");
        var AC = window.AudioContext || window.webkitAudioContext;
        var STEP = 0.5;        // seconds per arpeggio step
        var CHORD_STEPS = 16;  // steps per chord -> 8s chords
        var CHORDS = [
          { sub: 55.00, tones: [110.00, 164.81, 246.94, 261.63] },  // Am(add9)
          { sub: 43.65, tones: [87.31, 130.81, 220.00, 329.63] },   // Fmaj7
          { sub: 65.41, tones: [130.81, 196.00, 246.94, 329.63] },  // Cmaj7
          { sub: 49.00, tones: [98.00, 146.83, 220.00, 293.66] }     // G(add9)
        ];
        var ARP_PATTERN = [0, 2, 4, 1, 5, 3, 6, 4, 2, 5, 3, 1, 4, 6, 5, 3];
        var sfx = { ctx: null, master: null, delay: null, verb: null, timer: null, playing: false, step: 0, nextStep: 0 };

        function makeImpulse(ctx, dur, decay) {
          var rate = ctx.sampleRate, len = Math.floor(rate * dur);
          var buf = ctx.createBuffer(2, len, rate);
          for (var ch = 0; ch < 2; ch++) {
            var d = buf.getChannelData(ch);
            for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
          }
          return buf;
        }
        function buildAudio() {
          var ctx = new AC();
          sfx.ctx = ctx;
          var comp = ctx.createDynamicsCompressor();
          comp.threshold.value = -20; comp.knee.value = 24; comp.ratio.value = 4;
          comp.attack.value = 0.01; comp.release.value = 0.24;
          comp.connect(ctx.destination);
          var master = ctx.createGain(); master.gain.value = 0; master.connect(comp);
          sfx.master = master;
          var verb = ctx.createConvolver(); verb.buffer = makeImpulse(ctx, 3.2, 2.4);
          var wet = ctx.createGain(); wet.gain.value = 0.5;
          verb.connect(wet); wet.connect(master);
          sfx.verb = verb;
          var delay = ctx.createDelay(1); delay.delayTime.value = 0.375;
          var fb = ctx.createGain(); fb.gain.value = 0.34;
          var dWet = ctx.createGain(); dWet.gain.value = 0.3;
          delay.connect(fb); fb.connect(delay);
          delay.connect(dWet); dWet.connect(master); dWet.connect(verb);
          sfx.delay = delay;
          ctx.onstatechange = function () {
            if (ctx.state === "running") {
              disarmSound();
              window.removeEventListener("pointerdown", unlockAudio);
              window.removeEventListener("keydown", unlockAudio);
            } else if (sfx.playing) {
              /* The OS suspended or interrupted the context (screen lock,
                 backgrounded app, another app took the audio session).
                 Try to resume straight away, and re-arm the gesture unlock
                 so the next tap anywhere revives it if this attempt is
                 refused without a user gesture. */
              var p = ctx.resume();
              if (p && p.catch) p.catch(function () {});
              window.addEventListener("pointerdown", unlockAudio);
              window.addEventListener("keydown", unlockAudio);
            }
          };
        }
        function schedulePad(chord, t) {
          var ctx = sfx.ctx, dur = CHORD_STEPS * STEP, end = t + dur + 3.6;
          var filter = ctx.createBiquadFilter();
          filter.type = "lowpass"; filter.frequency.value = 720; filter.Q.value = 0.4;
          var lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.07;
          var lfoGain = ctx.createGain(); lfoGain.gain.value = 230;
          lfo.connect(lfoGain); lfoGain.connect(filter.frequency);
          lfo.start(t); lfo.stop(end);
          var g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.05, t + 3);
          g.gain.setValueAtTime(0.05, t + dur);
          g.gain.linearRampToValueAtTime(0, t + dur + 3.5);
          filter.connect(g); g.connect(sfx.master);
          var send = ctx.createGain(); send.gain.value = 0.55;
          g.connect(send); send.connect(sfx.verb);
          chord.tones.forEach(function (f) {
            [-6, 6].forEach(function (cents) {
              var o = ctx.createOscillator(); o.type = "sawtooth";
              o.frequency.value = f; o.detune.value = cents;
              var og = ctx.createGain(); og.gain.value = 0.5;
              o.connect(og); og.connect(filter);
              o.start(t); o.stop(end);
            });
          });
          var sub = ctx.createOscillator(); sub.type = "sine"; sub.frequency.value = chord.sub;
          var sg = ctx.createGain();
          sg.gain.setValueAtTime(0, t);
          sg.gain.linearRampToValueAtTime(0.055, t + 2.5);
          sg.gain.setValueAtTime(0.055, t + dur);
          sg.gain.linearRampToValueAtTime(0, t + dur + 3.5);
          sub.connect(sg); sg.connect(sfx.master);
          sub.start(t); sub.stop(end);
        }
        function scheduleArp(step, t) {
          var ctx = sfx.ctx;
          var chord = CHORDS[Math.floor(step / CHORD_STEPS) % CHORDS.length];
          var scale = chord.tones.concat([chord.tones[1] * 2, chord.tones[2] * 2, chord.tones[3] * 2]);
          var f = scale[ARP_PATTERN[step % ARP_PATTERN.length]];
          var o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f;
          var o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = f * 2;
          var g2 = ctx.createGain(); g2.gain.value = 0.22;
          var g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.085, t + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0008, t + 0.55);
          o.connect(g); o2.connect(g2); g2.connect(g);
          g.connect(sfx.master); g.connect(sfx.delay);
          o.start(t); o.stop(t + 0.6); o2.start(t); o2.stop(t + 0.6);
        }
        function scheduler() {
          var ctx = sfx.ctx;
          if (!ctx) return;
          if (sfx.nextStep < ctx.currentTime - 0.1) {
            /* Fell behind: the timer was throttled in a hidden tab or the
               context was interrupted, so every already-scheduled note has
               run out. Skip forward to the next chord boundary and restart
               from now — never burst-schedule the missed notes. */
            var rem = sfx.step % CHORD_STEPS;
            if (rem !== 0) sfx.step += CHORD_STEPS - rem;
            sfx.nextStep = ctx.currentTime + 0.05;
          }
          while (sfx.nextStep < ctx.currentTime + 1.6) {
            if (sfx.step % CHORD_STEPS === 0) {
              schedulePad(CHORDS[Math.floor(sfx.step / CHORD_STEPS) % CHORDS.length], sfx.nextStep);
            }
            scheduleArp(sfx.step, sfx.nextStep);
            sfx.step++;
            sfx.nextStep += STEP;
          }
        }
        function setSoundUI() {
          soundBtns.forEach(function (b) {
            b.classList.toggle("playing", sfx.playing);
            b.setAttribute("aria-pressed", String(sfx.playing));
          });
        }
        function disarmSound() {
          soundBtns.forEach(function (b) { b.classList.remove("armed"); });
        }
        function startSound() {
          if (!AC) return;
          try {
            if (!sfx.ctx) buildAudio();
            var ctx = sfx.ctx;
            if (ctx.state === "suspended") ctx.resume();
            if (ctx.state === "running") disarmSound();
            if (sfx.playing) { setSoundUI(); return; }
            sfx.playing = true;
            sfx.step = 0;
            sfx.nextStep = ctx.currentTime + 0.1;
            scheduler();
            sfx.timer = setInterval(scheduler, 200);
            sfx.master.gain.cancelScheduledValues(ctx.currentTime);
            sfx.master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.8);
            setSoundUI();
          } catch (e) { /* audio unavailable in this browser — page stays silent */ }
        }
        function stopSound() {
          if (!sfx.ctx) { sfx.playing = false; setSoundUI(); return; }
          var ctx = sfx.ctx, timer = sfx.timer;
          sfx.playing = false; sfx.timer = null;
          sfx.master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
          setTimeout(function () {
            if (!sfx.playing) {
              if (timer) clearInterval(timer);
              if (ctx.state === "running") ctx.suspend();
            }
          }, 900);
          setSoundUI();
        }
        function toggleSound() { if (sfx.playing) stopSound(); else startSound(); }
        soundBtns.forEach(function (b) { b.addEventListener("click", toggleSound); });

        /* Browsers refuse audible autoplay before the first user gesture,
           so try immediately and otherwise arm the first click / tap /
           keypress anywhere on the page to unlock the loop. The unlock
           handler only resumes the context — it never flips play state —
           and it ignores gestures that land on the toggle itself, so a
           first click on the button can't start-then-stop the track. */
        function unlockAudio(ev) {
          if (ev && ev.target && ev.target.closest && ev.target.closest(".sound-btn")) return;
          if (!sfx.ctx) return;
          if (sfx.playing && sfx.ctx.state !== "running") {
            var rp = sfx.ctx.resume();
            if (rp && rp.catch) rp.catch(function () {});
          }
          if (!sfx.playing || sfx.ctx.state === "running") {
            window.removeEventListener("pointerdown", unlockAudio);
            window.removeEventListener("keydown", unlockAudio);
          }
        }
        startSound();
        if (sfx.ctx && sfx.ctx.state !== "running") {
          soundBtns.forEach(function (b) { b.classList.add("armed"); });
          window.addEventListener("pointerdown", unlockAudio);
          window.addEventListener("keydown", unlockAudio);
        }

        /* ---------- keep the loop alive ----------
           Left alone, the track dies "after some time": mobile browsers
           suspend or interrupt the AudioContext when the screen locks, the
           app is backgrounded or another app takes the audio session, and
           hidden tabs throttle the scheduler's timer until the scheduled
           notes run out. This watchdog revives playback whenever it has
           stalled — resuming the context, restarting the scheduler timer
           if it was dropped, and letting scheduler() resync if it fell
           behind — so while the toggle is on, the loop never ends. */
        function recoverAudio() {
          if (!sfx.playing || !sfx.ctx) return;
          var ctx = sfx.ctx;
          if (ctx.state !== "running") {
            var p = ctx.resume();
            if (p && p.catch) p.catch(function () {});
          }
          if (!sfx.timer) sfx.timer = setInterval(scheduler, 200);
          scheduler();
        }
        setInterval(recoverAudio, 1000);
        document.addEventListener("visibilitychange", function () {
          if (!document.hidden) recoverAudio();
        });
        window.addEventListener("focus", recoverAudio);
        window.addEventListener("pageshow", recoverAudio);

        /* ---------- Calgary clock ---------- */
        var clockEl = document.getElementById("local-clock");
        function tickClock() {
          try {
            clockEl.textContent = new Intl.DateTimeFormat("en-CA", {
              timeZone: "America/Edmonton", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
            }).format(new Date());
          } catch (e) { clockEl.textContent = new Date().toLocaleTimeString(); }
        }
        tickClock(); setInterval(tickClock, 1000);

        /* ---------- mobile menu ---------- */
        var overlay = document.getElementById("menu-overlay");
        var menuBtn = document.getElementById("menu-btn");
        function closeMenu() { overlay.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }
        menuBtn.addEventListener("click", function () {
          var open = overlay.classList.toggle("open");
          menuBtn.setAttribute("aria-expanded", String(open));
        });
        document.getElementById("menu-close").addEventListener("click", closeMenu);
        overlay.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", closeMenu); });

        /* ---------- skills ticker ---------- */
        var skills = ["TypeScript","React","Node.js","Python","Java","C#","PostgreSQL","MongoDB","Docker","AWS","Linux","Burp Suite","Wireshark","Nmap","Splunk","Git","CI/CD","OWASP ASVS"];
        var track = document.getElementById("ticker-track");
        var half = skills.map(function (s) { return "<span>" + s + "</span>"; }).join("");
        track.innerHTML = half + half;

        /* ---------- hero scramble ---------- */
        var title = document.getElementById("hero-title");
        var finalText = "Secure software, engineered with intent.";
        function renderTitle(plain) {
          title.innerHTML = "";
          plain.split(" ").forEach(function (word, i, arr) {
            var span = document.createElement("span");
            span.textContent = word;
            if (word === "Secure") span.className = "accent-word";
            title.appendChild(span);
            if (i < arr.length - 1) title.appendChild(document.createTextNode(" "));
          });
        }
        if (reduced) {
          renderTitle(finalText);
        } else {
          var glyphs = "!<>-_\\/[]{}=+*^?#0101";
          var frame = 0, total = 26;
          (function scramble() {
            var revealCount = Math.floor((frame / total) * finalText.length);
            var shown = finalText.slice(0, revealCount);
            for (var i = revealCount; i < finalText.length; i++) {
              shown += finalText[i] === " " ? " " : glyphs[Math.floor(Math.random() * glyphs.length)];
            }
            renderTitle(shown);
            frame++;
            if (frame <= total) setTimeout(scramble, 26);
            else renderTitle(finalText);
          })();
        }

        /* ---------- hero canvas network ---------- */
        var canvas = document.getElementById("net-canvas");
        var ctx = canvas.getContext("2d");
        var nodes = [], W = 0, H = 0;
        function sizeCanvas() {
          var hero = canvas.parentElement;
          W = canvas.width = hero.clientWidth;
          H = canvas.height = hero.clientHeight;
          var count = Math.min(70, Math.floor(W / 16));
          nodes = [];
          for (var i = 0; i < count; i++) {
            nodes.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35 });
          }
        }
        function accentRGB() {
          return currentTheme() === "dark" ? "46,230,255" : "2,132,199";
        }
        function drawNet() {
          ctx.clearRect(0, 0, W, H);
          var rgb = accentRGB();
          for (var i = 0; i < nodes.length; i++) {
            var a = nodes[i];
            a.x += a.vx; a.y += a.vy;
            if (a.x < 0 || a.x > W) a.vx *= -1;
            if (a.y < 0 || a.y > H) a.vy *= -1;
            for (var j = i + 1; j < nodes.length; j++) {
              var b = nodes[j], dx = a.x - b.x, dy = a.y - b.y, d = Math.sqrt(dx * dx + dy * dy);
              if (d < 140) {
                ctx.strokeStyle = "rgba(" + rgb + "," + (0.14 * (1 - d / 140)) + ")";
                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
              }
            }
            ctx.fillStyle = "rgba(" + rgb + ",0.5)";
            ctx.fillRect(a.x - 1.2, a.y - 1.2, 2.4, 2.4);
          }
          if (!reduced) requestAnimationFrame(drawNet);
        }
        sizeCanvas(); drawNet();
        window.addEventListener("resize", function () { sizeCanvas(); if (reduced) drawNet(); });

        /* ---------- reveal on scroll + counters + nav spy ---------- */
        var revealIO = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); revealIO.unobserve(e.target); } });
        }, { threshold: 0.12 });
        document.querySelectorAll(".reveal").forEach(function (el) { revealIO.observe(el); });

        var counted = false;
        function runCounters() {
          if (counted) return;
          counted = true;
          document.querySelectorAll(".count").forEach(function (el) {
            var target = parseInt(el.getAttribute("data-count"), 10);
            if (reduced) { el.textContent = target; return; }
            var start = null;
            (function step(ts) {
              if (!start) start = ts;
              var p = Math.min((ts - start) / 1300, 1);
              el.textContent = Math.floor(target * (1 - Math.pow(1 - p, 3)));
              if (p < 1) requestAnimationFrame(step); else el.textContent = target;
            })(performance.now());
          });
        }
        var statsIO = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) { if (e.isIntersecting) runCounters(); });
        }, { threshold: 0.35 });
        statsIO.observe(document.getElementById("stats"));

        var navLinks = document.querySelectorAll("#rail-nav a");
        var spyIO = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            navLinks.forEach(function (a) { a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id); });
          });
        }, { rootMargin: "-40% 0px -55% 0px" });
        ["about", "expertise", "lab", "approach", "experience", "contact"].forEach(function (id) {
          var s = document.getElementById(id); if (s) spyIO.observe(s);
        });

        /* ---------- résumé download ---------- */
        var RESUME = [
          "YASHDEEP SINGH",
          "Software Developer · Application Security",
          "Calgary, AB · y.yashjagait@gmail.com",
          "Available for full-time roles",
          "",
          "SUMMARY",
          "Software developer with a cybersecurity degree from SAIT. I design and build",
          "applications that are fast, maintainable and secure from the first commit.",
          "Trained in both full-stack engineering and offensive/defensive security:",
          "threat modelling, secure code review, and hardened infrastructure.",
          "",
          "EDUCATION",
          "Cybersecurity Degree — SAIT (Southern Alberta Institute of Technology)",
          "  Network security, digital forensics, applied cryptography, ethical hacking,",
          "  incident response.",
          "Software Development Diploma — SAIT",
          "  Full-stack development, OOP, databases, mobile apps, agile capstone.",
          "",
          "CERTIFICATIONS",
          "CompTIA Security+ — In progress",
          "Google Cybersecurity Professional Certificate",
          "AWS Cloud Practitioner — Planned 2026",
          "",
          "EXPERIENCE",
          "Full-Stack Developer — WebEquator (Remote), Dec 2024 — Present",
          "  - Full-stack web apps with Angular, TypeScript, Node.js and Python.",
          "  - Secure RESTful APIs and middleware integrating third-party platforms,",
          "    databases and e-commerce services.",
          "  - Relational database modelling (SQL/PostgreSQL) and efficient queries.",
          "  - Figma designs translated to responsive HTML5/CSS3 Angular frontends.",
          "  - Agile stand-ups, code reviews, production debugging, Git feature",
          "    branching and CI/CD pipelines.",
          "",
          "POS System Restoration — Freelance, Fatburger, Calgary, AB (Oct 15, 2026)",
          "  - Diagnosed and restored a point-of-sale system after an outage: full",
          "    software update and clean reinstall, then verified the complete order",
          "    and payment workflow with minimal downtime.",
          "",
          "SKILLS",
          "Engineering: TypeScript, React, Node.js, Python, Java, C#, SQL, REST, Git",
          "AppSec: OWASP, pen testing, Burp Suite, Auth & IAM, cryptography, SAST/DAST",
          "Infra: Linux, Docker, AWS, Wireshark, Splunk, Nmap, incident response",
          "",
          "HIGHLIGHTS",
          "15+ projects delivered · 40+ CTF challenges solved ·",
          "60% fewer vulnerabilities in code reviews"
        ].join("\n");
        function downloadResume() {
          var blob = new Blob([RESUME], { type: "text/plain;charset=utf-8" });
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          a.href = url; a.download = "Yashdeep-Singh-Resume.txt";
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        }
        document.getElementById("resume-btn").addEventListener("click", downloadResume);

        /* ---------- copy email ---------- */
        function copyText(text, btn, doneLabel) {
          function done() {
            var old = btn.textContent;
            btn.textContent = doneLabel;
            setTimeout(function () { btn.textContent = old; }, 1800);
          }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, function () { fallback(); });
          } else fallback();
          function fallback() {
            var ta = document.createElement("textarea");
            ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
            document.body.appendChild(ta); ta.select();
            try { document.execCommand("copy"); done(); } catch (e) {}
            ta.remove();
          }
        }
        document.getElementById("copy-email").addEventListener("click", function () {
          copyText("y.yashjagait@gmail.com", this, "Copied ✓");
        });

        /* ---------- contact form -> mailto ---------- */
        var form = document.getElementById("contact-form");
        var formStatus = document.getElementById("form-status");
        form.addEventListener("submit", function (ev) {
          ev.preventDefault();
          var name = document.getElementById("cf-name").value.trim();
          var email = document.getElementById("cf-email").value.trim();
          var company = document.getElementById("cf-company").value.trim();
          var msg = document.getElementById("cf-msg").value.trim();
          if (!name || !email || !msg || email.indexOf("@") < 1) {
            formStatus.textContent = "Please add your name, a valid email, and a message first.";
            formStatus.classList.add("err");
            return;
          }
          formStatus.classList.remove("err");
          var subject = "Portfolio contact — " + name + (company ? " (" + company + ")" : "");
          var body = msg + "\n\n— " + name + "\n" + email + (company ? "\n" + company : "");
          formStatus.textContent = "Opening your mail app with the message addressed to y.yashjagait@gmail.com…";
          var mailLink = document.createElement("a");
          mailLink.href = "mailto:y.yashjagait@gmail.com?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
          document.body.appendChild(mailLink);
          mailLink.click();
          mailLink.remove();
        });

        document.getElementById("to-top").addEventListener("click", function () {
          window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
        });

        /* ================= LAB: AES-256-GCM ================= */
        var labMsg = document.getElementById("lab-msg");
        var labStatus = document.getElementById("lab-status");
        var outCt = document.getElementById("out-ct"), outPt = document.getElementById("out-pt");
        var btnEnc = document.getElementById("btn-encrypt"), btnDec = document.getElementById("btn-decrypt"), btnTam = document.getElementById("btn-tamper");
        var labState = null; // { ct: Uint8Array, iv: Uint8Array }
        var labKey = crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

        function b64(bytes) {
          var s = "", chunk = 0x8000;
          for (var i = 0; i < bytes.length; i += chunk) {
            s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
          }
          return btoa(s);
        }
        function setStatus(text, cls) {
          labStatus.textContent = text;
          labStatus.className = "lab-status" + (cls ? " " + cls : "");
        }
        function setBusy(busy) {
          btnEnc.disabled = busy;
          btnDec.disabled = busy || !labState;
          btnTam.disabled = busy || !labState;
        }
        btnEnc.addEventListener("click", function () {
          var msg = labMsg.value;
          if (!msg) { setStatus("Type a message first.", "err"); return; }
          setBusy(true); setStatus("Encrypting with this tab's AES-256 key…");
          var iv = crypto.getRandomValues(new Uint8Array(12));
          labKey.then(function (key) {
            return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, new TextEncoder().encode(msg));
          }).then(function (ctBuf) {
            labState = { ct: new Uint8Array(ctBuf), iv: iv };
            outCt.textContent = b64(labState.ct);
            outPt.textContent = "—";
            setStatus("Encrypted. The ciphertext and IV are all an attacker would ever see — the key never leaves this tab, so the message itself stays unreadable.", "ok");
            setBusy(false);
          }).catch(function () {
            setStatus("Encryption failed in this browser.", "err"); setBusy(false);
          });
        });
        btnDec.addEventListener("click", function () {
          if (!labState) return;
          setBusy(true); setStatus("Verifying the GCM integrity tag and decrypting…");
          labKey.then(function (key) {
            return crypto.subtle.decrypt({ name: "AES-GCM", iv: labState.iv }, key, labState.ct);
          }).then(function (ptBuf) {
            outPt.textContent = new TextDecoder().decode(ptBuf);
            setStatus("Integrity check passed — decrypted successfully. Untouched data, verified by the GCM tag.", "ok");
            setBusy(false);
          }).catch(function () {
            outPt.textContent = "—";
            setStatus("✕ REJECTED — AES-GCM integrity check failed. The ciphertext was tampered with: decryption refused, exactly as designed.", "err");
            setBusy(false);
          });
        });
        btnTam.addEventListener("click", function () {
          if (!labState) return;
          var idx = Math.floor(labState.ct.length / 2);
          labState.ct[idx] = labState.ct[idx] ^ 0xff;
          outCt.textContent = b64(labState.ct);
          outPt.textContent = "—";
          setStatus("One byte of the ciphertext was flipped. Now press Decrypt — GCM will detect the change and refuse.", "warn");
        });
        document.getElementById("copy-ct").addEventListener("click", function () {
          if (labState) copyText(b64(labState.ct), this, "Copied ✓");
        });

        /* ================= TERMINAL ================= */
        var termBody = document.getElementById("term-body");
        var termOut = document.getElementById("term-out");
        var termInput = document.getElementById("term-input");
        var history = [], histIdx = -1;

        function print(html, cls) {
          var div = document.createElement("div");
          div.className = "out" + (cls ? " " + cls : "");
          div.innerHTML = html;
          termOut.appendChild(div);
          termBody.scrollTop = termBody.scrollHeight;
        }
        function esc(s) {
          return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }
        function gotoSection(id) {
          var el = document.getElementById(id);
          if (el) { el.scrollIntoView({ behavior: reduced ? "auto" : "smooth" }); return true; }
          return false;
        }
        var COMMANDS = {
          help: function () {
            print("Available commands:", "acc");
            print(
              "  about       who Yash is\n" +
              "  skills      the full stack, both sides of the firewall\n" +
              "  goto &lt;sec&gt;  jump to: about · expertise · lab · approach · experience · contact\n" +
              "  lab         how the encryption lab works\n" +
              "  email       show the contact email\n" +
              "  resume      download the résumé\n" +
              "  theme       toggle light / dark\n" +
              "  sound       toggle the futuristic soundtrack\n" +
              "  whoami      you are…?\n" +
              "  date        local Calgary time\n" +
              "  clear       wipe the terminal"
            );
          },
          about: function () {
            print("Yashdeep Singh — software developer with a cybersecurity degree (both from SAIT, Calgary).");
            print("Full-stack engineering + application security: code that ships fast and holds up under attack.");
          },
          skills: function () {
            print("Engineering : TypeScript · React · Node.js · Python · Java · C# · PostgreSQL · MongoDB");
            print("Security    : OWASP · Burp Suite · pen testing · Auth &amp; IAM · cryptography · SAST/DAST");
            print("Infra       : Linux · Docker · AWS · Wireshark · Splunk · Nmap · incident response");
          },
          lab: function () {
            print("Section 03 runs real AES-256-GCM in your browser: a fresh random 256-bit key");
            print("held only in this tab, a random IV per message, and a GCM tag that makes any");
            print("tampering detectable. Scroll there and try to break it.");
          },
          email: function () { print("y.yashjagait@gmail.com", "acc"); },
          contact: function () { gotoSection("contact"); print("Jumping to the contact section…", "dim"); },
          resume: function () { downloadResume(); print("Résumé download started.", "acc"); },
          theme: function () { toggleTheme(); print("Theme switched to " + currentTheme() + ".", "dim"); },
          sound: function () {
            toggleSound();
            print(sfx.playing ? "Soundtrack on — a generative synth loop, synthesised live in your browser. It never ends." : "Soundtrack off.", "dim");
          },
          whoami: function () { print("guest — but around here, that's read-only access.", "dim"); },
          date: function () { print("Calgary: " + clockEl.textContent + " MT"); },
          sudo: function () { print("Nice try. guest is not in the sudoers file. This incident will be reported (to the Lab section).", "err"); },
          clear: function () { termOut.innerHTML = ""; }
        };
        function runCommand(raw) {
          var line = raw.trim();
          print('<span class="cmd-echo">guest@<span style="color:#9d8cff">ys-secure</span>:~$ ' + esc(line) + "</span>");
          if (!line) return;
          history.unshift(line); histIdx = -1;
          var parts = line.split(/\s+/);
          var cmd = parts[0].toLowerCase();
          if (cmd === "goto" || cmd === "open" || cmd === "cd") {
            var target = (parts[1] || "").toLowerCase().replace("#", "");
            if (gotoSection(target)) print("→ #" + target, "dim");
            else print("No such section: " + esc(parts[1] || "") + " — try about, expertise, lab, approach, experience, contact.", "err");
          } else if (COMMANDS[cmd]) {
            COMMANDS[cmd]();
          } else {
            print("command not found: " + esc(cmd) + " — type 'help'", "err");
          }
          termBody.scrollTop = termBody.scrollHeight;
        }
        print("YS-SECURE shell — session started. All traffic on this page is local.", "dim");
        print("Type <span class='acc'>help</span> to see available commands.");
        termBody.addEventListener("click", function () { termInput.focus(); });
        termInput.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter") {
            runCommand(termInput.value);
            termInput.value = "";
          } else if (ev.key === "ArrowUp") {
            ev.preventDefault();
            if (histIdx < history.length - 1) { histIdx++; termInput.value = history[histIdx] || ""; }
          } else if (ev.key === "ArrowDown") {
            ev.preventDefault();
            if (histIdx > 0) { histIdx--; termInput.value = history[histIdx] || ""; }
            else { histIdx = -1; termInput.value = ""; }
          }
        });
      })();
