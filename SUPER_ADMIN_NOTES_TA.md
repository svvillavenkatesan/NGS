# Super Admin Panel — உறுதிசெய்யப்பட்ட Notes

## 1. தற்போதைய வேலை முறை

- முதலில் Super Admin panel முழுமையாக முடிக்க வேண்டும்.
- அதன் பிறகு Distributor, Sub-Distributor மற்றும் Seller panels தொடர வேண்டும்.
- Admin page compact tabs முறையில் இருக்க வேண்டும்.

## 2. Super Admin Tabs

1. Dashboard
2. Results
3. Distributors
4. Schemes
5. Lot Codes

தேவைப்பட்டால் பின்னர் கூடுதல் tabs சேர்க்கலாம்.

## 3. வெற்றி எண் — EDABC

வெற்றி எண் 5 இலக்கமாக இருக்கும்.

எடுத்துக்காட்டு: `95846`

- E = 9 — முதல் இலக்கம்
- D = 5 — இரண்டாவது இலக்கம்
- A = 8 — மூன்றாவது இலக்கம்
- B = 4 — நான்காவது இலக்கம்
- C = 6 — கடைசி இலக்கம்

## 4. Scheme-specific Prize விதி

Ticket-ல் எந்த Scheme தேர்வு செய்யப்பட்டதோ, அந்த Scheme-ல் பதிவு செய்யப்பட்ட பரிசுத் தொகைகள் மட்டுமே பயன்படுத்தப்பட வேண்டும்.

பொதுவான 3D/4D prize table-லிருந்து பரிசு எடுக்கக் கூடாது.

Ticket விற்கப்படும் நேரத்தில் Scheme prize configuration snapshot ஆகச் சேமிக்கப்பட வேண்டும். பின்னர் Admin Scheme prize-ஐ மாற்றினாலும் ஏற்கனவே விற்ற ticket-ன் பரிசு மாறக்கூடாது.

## 5. Highest Match Only விதி

ஒரே ticket-க்கு பல பரிசுகளைச் சேர்த்துக் கொடுக்கக் கூடாது.

முதலில் அதிக இலக்கப் பொருத்தத்தைச் சரிபார்க்க வேண்டும். அது பொருந்தினால் அதற்குரிய ஒரே பரிசு மட்டும் வழங்கப்பட வேண்டும்.

### எடுத்துக்காட்டு — `3D-30-15K`

- ABC பொருந்தினால் → ₹15,000 மட்டும்
- ABC பொருந்தவில்லை; BC பொருந்தினால் → ₹1,000 மட்டும்
- ABC மற்றும் BC பொருந்தவில்லை; C பொருந்தினால் → ₹100 மட்டும்
- எதுவும் பொருந்தவில்லை என்றால் → பரிசு இல்லை

₹15,000 கிடைத்தால் ₹1,000 மற்றும் ₹100 கிடையாது. ₹1,000 கிடைத்தால் ₹100 கிடையாது.

## 6. உறுதிசெய்த 3D Schemes

### `3D-30-15K`

- விற்பனை விலை: ₹30
- ABC → ₹15,000
- BC → ₹1,000
- C → ₹100

### `3D-35-17K`

- விற்பனை விலை: ₹35
- ABC → ₹17,500
- BC → ₹1,000
- C → ₹100

AB மற்றும் AC இந்த இரண்டு 3D schemes-ல் பொருந்தாது.

## 7. 5D Scheme — EDABC

- EDABC முழுவதும் பொருந்தினால் → ₹10,00,000
- கடைசி DABC பொருந்தினால் → ₹50,000
- கடைசி ABC பொருந்தினால் → ₹10,000
- கடைசி BC பொருந்தினால் → ₹2,000
- கடைசி C பொருந்தினால் → ₹500

இதிலும் Highest Match Only விதி பின்பற்றப்பட வேண்டும்.

## 8. 4D Scheme — DABC

- DABC பொருந்தினால் → ₹50,000
- ABC பொருந்தினால் → ₹10,000
- BC பொருந்தினால் → ₹2,000
- C பொருந்தினால் → ₹500

இதிலும் Highest Match Only விதி பின்பற்றப்பட வேண்டும்.

## 9. 3D Scheme — ABC

- ABC பொருந்தினால் → Scheme-ல் நிர்ணயித்த 3D prize
- BC பொருந்தினால் → Scheme-ல் நிர்ணயித்த 2D prize
- C பொருந்தினால் → Scheme-ல் நிர்ணயித்த Single Digit prize

## 10. Position-specific Schemes

### Two Digit

- AB → A மற்றும் B இடங்கள் மட்டும்
- AC → A மற்றும் C இடங்கள் மட்டும்
- BC → B மற்றும் C இடங்கள் மட்டும்

### Single Digit

- A → A இடம் மட்டும்
- B → B இடம் மட்டும்
- C → C இடம் மட்டும்

தேர்வு செய்யாத position-க்கு பரிசு வழங்கப்படக் கூடாது.

## 11. Lot Code அமைப்பு

Lot Code எடுத்துக்காட்டுகள்:

- KL — Kerala
- D — Dear
- SK — Sikkim
- AR — Arasan
- PB — Punjab

Scheme Master-ல் இருக்கும் Scheme எல்லா Distributor-க்கும் தானாக வழங்கப்படக் கூடாது.

ஒவ்வொரு Distributor-க்கும் ஒவ்வொரு Lot Code அடிப்படையில் Schemes மற்றும் Rates தனித்தனியாகச் சேமிக்கப்பட வேண்டும்.

### சரியான நடைமுறை

1. Distributor தேர்வு
2. ஒரு Lot Code தேர்வு
3. அந்த Lot Code-க்கு தேவையான Schemes தேர்வு
4. ஒவ்வொரு Scheme-க்கும் Rate பதிவு
5. Save Distributor
6. அடுத்த Lot Code தேவைப்பட்டால் அதைத் தேர்வு செய்து தனியாகப் பதிவு

`Select All` தற்போதைய Lot Code-க்கு மட்டும் செயல்பட வேண்டும்.

## 12. Distributor List

- பொதுவான Scheme பட்டியலை ஒவ்வொரு Distributor row-லும் மீண்டும் காட்ட வேண்டியதில்லை.
- Lot Codes சுருக்கமாகக் காட்டலாம்.
- Additional/Special Scheme மற்றும் அதன் Rate மட்டும் காட்டலாம்.

### Minimum Distributor Price

- ஒவ்வொரு Scheme-க்கும் Scheme Rate, Minimum Distributor Price மற்றும் MRP தனியாக இருக்க வேண்டும்.
- Distributor rate அந்த Scheme-ன் Minimum Price-க்கு கீழே இருக்கக் கூடாது.
- UI input மற்றும் backend validation இரண்டிலும் குறைந்த rate தடுக்கப்பட வேண்டும்.

## 13. Result மற்றும் Profit

- Admin முதலில் 5 இலக்க Result Profit Preview பார்க்க வேண்டும்.
- விற்பனையான tickets அடிப்படையில் prize exposure கணக்கிட வேண்டும்.
- Minimum Profit target-ஐ percentage அல்லது fixed amount ஆக Admin அமைக்க வேண்டும்.
- Target-ஐ அடையாத Result-க்கும் உண்மையான Profit/Loss தொகை மற்றும் percentage காட்ட வேண்டும்.
- `Below Target` warning காட்டிய பிறகும் Admin விரும்பினால் அந்த எண்ணை publish செய்ய அனுமதிக்க வேண்டும்.
- Result publish செய்ததும் Distributor வாரியான Profit/Loss report உடனடியாகக் கிடைக்க வேண்டும்.
- Result publish மட்டும் செய்ய வேண்டும்; automatic settlement செய்யக்கூடாது.

## 14. இன்னும் சரிசெய்ய வேண்டிய முக்கிய கணக்கீடு

தற்போதைய engine-ல் position matching உள்ளது. ஆனால் எல்லா ticket calculations-லும் தேர்ந்தெடுத்த Catalog Scheme-ன் prize snapshot பயன்படுத்தப்படுகிறதா என்பதை முழுமையாகச் சரிசெய்து சோதிக்க வேண்டும்.

இது முடியும் வரை Scheme-specific prize calculation முழுமையாக முடிந்ததாகக் கருதக் கூடாது.
