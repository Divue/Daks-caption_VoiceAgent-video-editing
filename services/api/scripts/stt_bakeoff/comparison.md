# Transcription comparison

Every engine's Roman output against the hand-written transcript, on our own clips.
WER = word error rate (lower is better). WER* ignores elongation ('helloooo' == 'hello'),
since we add elongation on purpose.

## Scores

| Clip | Engine | WER | WER* | Seconds | Word timings |
| --- | --- | --- | --- | --- | --- |
| Excited_long_texts | sarvam | 46.7% | 20.0% | 0.8s | NO |
| Excited_long_texts | transcribe-hi | 46.7% | 26.7% | 13.1s | yes (15) |
| Excited_long_texts | transcribe-en | 33.3% | 6.7% | 4.2s | yes (13) |
| Angry | sarvam | 27.3% | 15.9% | 1.8s | NO |
| Angry | transcribe-hi | 29.5% | 18.2% | 17.7s | yes (46) |
| Angry | transcribe-en | 40.9% | 31.8% | 11.2s | yes (37) |
| Normal | sarvam | 36.0% | 32.0% | 1.6s | NO |
| Normal | transcribe-hi | 38.0% | 32.0% | 19.3s | yes (51) |
| Normal | transcribe-en | 58.0% | 54.0% | 4.4s | yes (47) |
| Real_reel | sarvam | 22.6% | 19.4% | 1.8s | NO |
| Real_reel | transcribe-hi | 19.4% | 18.3% | 22.4s | yes (95) |
| Real_reel | transcribe-en | 100.0% | 100.0% | 4.9s | NO |

## Side by side

### Excited_long_texts

**Your transcript**  
> Helloooo guuyyyssss right now I'm at my house sooo howz's it going? Whaaatt

**Sarvam (translit)**  
> Hello guys. Right now I am at my house. So how is it going? What?

**AWS Transcribe hi-IN + Bedrock**  
> Hello guys, right now. I am at my house. So how is it going? Woh.

**AWS Transcribe en-IN**  
> Hello guys. Right now, I'm at my house. So, how's it going? What?

**Emotions you marked:** `guuyyyssss` = egxarated, `sooo` = excited, `Whaaatt` = exclamation

### Angry

**Your transcript**  
> Whattt the fuckkk , bhai? Whatt the fuckk is happening , bhai? I'm fed up of this shit , bhai. I should just do kheti bhari, bhai, at this point. What the fuck is wrong with you guys, bhai? Tumlog se kam kyu ni hota , behenchod?

**Sarvam (translit)**  
> What the fuck bhai, what the fuck is happening bhai. I am fed up of this shit bhai. I should just do kheti baari bhai at this point. What the fuck is wrong with you guys bhai. Tum logon se kaam kyon nahi hota hai behenchod.

**AWS Transcribe hi-IN + Bedrock**  
> What the fuck bhai what the fuck is happening bhai. I am fed up of this shit bhai I should just do kheti baari bhai at this point. What the fuck is wrong with you guys bhai tum logon se kaam kyun nahi hota hai bahanchod.

**AWS Transcribe en-IN**  
> What the fuck why? What the fuck is happening, right? I'm fed up of this shit. Why I should just do Kitiwari by at this point. What the fuck is wrong with you guys by Tumlosekamkunihotabe Hencho.

**Emotions you marked:** `fuckkk` = angry exaggerated, `happening` = frustrated, `shit` = angry frustrated, `hota` = frustrated

### Normal

**Your transcript**  
> Hello guyss , this is Shubh here aaa aaj STT test karna hai aur yaha hamlog pagal ho chuke h bhai kam karte karte So hamlog, well mai bennett university se hu, 4th year I don't know what to say anymore right now but dekhte hai Testing video hash one

**Sarvam (translit)**  
> Hello guys, this is Shubhair. uh Aaj STT test karna hai. Aur yahan hum log pagal ho chuke hain bhai kaam karte karte. So hum log well main Benetton University se hoon fourth year. uh I don't know what to say anymore right now but dekhne hain testing video hash one.

**AWS Transcribe hi-IN + Bedrock**  
> Hello guys this is Shubher ah. Aaj ST test karna hai aur yahan hum log pagal ho chuke hain bhai kaam karte karte. So hum log well main bed university se hoon fourth year. Ah I don't know what to say anymore right now but Dick ne testing video hash one.

**AWS Transcribe en-IN**  
> Hello guys, this is Javert, uh. A stat test can I uh yeah I'm look paga loch again I can't get the. So, Hamlog, well, Member University is in 4th year. Uh, I don't know what to say anymore right now, but Digner testing video has one.

**Emotions you marked:** `guyss` = excited

### Real_reel

**Your transcript**  
> Yeh jaante hue ki har saal meri birthday kaise manti hai, apne birthday se ek mahina pehle jo main khwaab dekhna chaalu kar deti hoon ki "oh my god, log mere liye chaand taare shakkar pare leke aayenge," mere saal ka sabse khatiya din jaata hai mera birthday. Har saal yeh track record hai ki main apne birthday par royi hoon. Ab main apna mooh leke baith gayi hoon ki "hai, meri birthday aa rahi hai, badhiya niklegi ya koi badhiya nahi niklegi." Mujhe bhi pata hai rona machne wala hai us din.

**Sarvam (translit)**  
> Ye jaante hue ki har saal meri birthday kaise manati hai. Apne birthday se ek mahina pehle jo main khab dekhne chalu kar deti hun ki oh my god log mere liye chand tare shakkar pare leke aayenge. Mera saal ka sabse ghatiya din zyada hai mera birthday. Har saal ye track record hai ki main apne birthday pe roi hun. Ab main apna munh saja ke baith gayi hun ki hai hai meri birthday aa rahi hai. Badhiya niklegi, koi badhiya nahi niklegi. Mujhe bhi pata hai rona machne wala hai us din.

**AWS Transcribe hi-IN + Bedrock**  
> Ye jaante hue ki har saal meri birthday kaisi manti hai. Apne birthday se ek mahina pehle jo main khaab dekhna chaalu kar deti hoon ki oh my god log mere liye chai taare shakkar paare leke aayenge. Mera saal ka sabse ghatiya din zyada hai mera birthday, har saal ye track record hai ki main apne birthday pe roi hoon. Ab main apna mooh se ja ke baith gayi hoon ki hi haay meri birthday aa rahi hai, biya niklegi, koi badhiya nahi niklegi, mujhe bhi pata hai rona machne wala hai us din.

**AWS Transcribe en-IN**  
> _(empty)_

## Worked example: Excited_long_texts.mp4

How one clip becomes captions, word by word.

| # | Transcribe (timing) | ms | Sarvam (text) | matched | held extra | caption | tag |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | हेलो | 490–1169 | Hello | yes | 79ms | **Hello** | — |
| 2 | गाइज | 1169–2029 | guys | yes | 560ms | **guuuuuuys** | emphasis, excited x2.87 |
| 3 | राइट | 3380–3650 | Right | yes | -30ms | **Right** | — |
| 4 | नौ | 3650–3990 | now | yes | 40ms | **now** | emphasis |
| 5 | आई | 5099–5110 | I | yes | -289ms | **I** | — |
| 6 | एएम | 5260–5440 | am | yes | -120ms | **am** | — |
| 7 | एटी | 5440–5579 | at | yes | -161ms | **at** | — |
| 8 | माई | 5579–5780 | my | yes | -99ms | **my** | — |
| 9 | हाउस | 5780–6250 | house | yes | -130ms | **house** | — |
| 10 | सो | 7219–7519 | So | yes | 0ms | **So** | emphasis |
| 11 | होव | 8460–8819 | how | yes | 59ms | **how** | — |
| 12 | इस | 8819–8949 | is | yes | -170ms | **is** | — |
| 13 | इट | 8949–9300 | it | yes | 51ms | **it** | — |
| 14 | गोइंग | 9300–9659 | going | yes | 59ms | **going** | — |
| 15 | वो | 11760–12576 (repaired) | What | yes | 516ms | **Whaaaaat** | emphasis, excited x2.72 |
