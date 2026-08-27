# Number Game System — Super Admin கையேடு

## 1. Super Admin பக்கத்தைத் திறப்பது

Browser-ல் கீழேயுள்ள முகவரியைத் திறக்கவும்:

`http://localhost:4000/admin`

உங்கள் Super Admin mobile number மற்றும் password-ஐ உள்ளிட்டு **Sign in** செய்யவும்.

> Password-ஐ வேறு நபர்களுடன் பகிர வேண்டாம்.

## 2. Super Admin tabs

Super Admin panel ஐந்து முக்கிய tabs ஆகப் பிரிக்கப்பட்டுள்ளது:

1. **Dashboard**
2. **Results**
3. **Distributors**
4. **Schemes**
5. **Lot Codes**

## 3. Dashboard

Dashboard-ல் பின்வரும் சுருக்கத் தகவல்கள் தெரியும்:

- தற்போது வெளியிடப்பட்ட Live Result
- மொத்த விற்பனை
- Net Profit
- Ticket மற்றும் Network எண்ணிக்கை
- Distributor Profit/Loss
- சமீபத்திய Ticket activity

Dashboard தகவல்கள் பார்வைக்காக மட்டுமே. Result வெளியிடுவது **Results** tab-ல் நடைபெறும்.

## 4. Results

### 4.1 DABC வெற்றி எண்

Result என்பது நான்கு இலக்க `DABC` எண்ணாக இருக்க வேண்டும்.

எடுத்துக்காட்டு: `5846`

- `D = 5`
- `A = 8`
- `B = 4`
- `C = 6`

### 4.2 Result Profit Preview

1. **Results** tab-ஐத் திறக்கவும்.
2. **Possible four-digit winning number** பகுதியில் 4 இலக்க எண்ணை உள்ளிடவும்.
3. **Calculate profit** அழுத்தவும்.
4. பரிசுச் செலவு, projected profit/loss மற்றும் profit percentage-ஐச் சரிபார்க்கவும்.

இந்த நடவடிக்கை Result-ஐ வெளியிடாது.

### 4.3 Minimum Profit Target

Minimum profit-ஐ percentage அல்லது fixed amount ஆக அமைக்கலாம். நிர்ணயித்த அளவை அடையாத எண்ணுக்கு உண்மையான Profit/Loss மற்றும் percentage உடன் `Below Target` warning காட்டப்படும். Warning இருந்தாலும் Admin விரும்பினால் அந்த எண்ணை வெளியிடலாம்.

### 4.4 Result வெளியிடுதல்

1. Profit Preview-ஐ முதலில் சரிபார்க்கவும்.
2. **Four-digit winning number (DABC)** பகுதியில் எண்ணை உள்ளிடவும்.
3. எண்ணை மீண்டும் சரிபார்க்கவும்.
4. **Publish Result** அழுத்தவும்.

> Result publish செய்த பிறகு அதை மாற்றக்கூடிய வசதி தற்போது இல்லை. எனவே எண்ணை வெளியிடுவதற்கு முன் கவனமாகச் சரிபார்க்கவும்.

## 5. பரிசு பொருத்தும் விதிகள்

### 4 Digit — DABC

- DABC பொருந்தினால்: ₹50,000
- ABC பொருந்தினால்: ₹10,000
- BC பொருந்தினால்: ₹2,000
- C பொருந்தினால்: ₹500

### 3 Digit — ABC

- ABC பொருந்தினால்: ₹25,000
- BC பொருந்தினால்: ₹10,000
- C பொருந்தினால்: ₹1,000

### 2 Digit

- AB, AC மற்றும் BC தங்களுக்குரிய இடங்களில் மட்டுமே பொருத்தப்படும்.

### Single Digit

- A, B மற்றும் C தங்களுக்குரிய இடங்களில் மட்டுமே பொருத்தப்படும்.

## 6. Distributors

### 6.1 புதிய Distributor சேர்ப்பது

1. **Distributors** tab-ஐத் திறக்கவும்.
2. **Select Distributor** பகுதியில் `+ Add New Distributor` தேர்வு செய்யவும்.
3. Distributor name, mobile number மற்றும் temporary password உள்ளிடவும்.
4. ஒரு Lot Code-ஐத் தேர்வு செய்யவும்.
5. அந்த Lot Code-க்கு தேவையான schemes-ஐ tick செய்யவும்.
6. ஒவ்வொரு scheme-க்கும் ₹ rate உள்ளிடவும்.
7. **Add Distributor** அழுத்தவும்.

Scheme-ல் நிர்ணயிக்கப்பட்ட **Minimum Distributor Price**-க்கு கீழே rate உள்ளிடவோ சேமிக்கவோ முடியாது.

### 6.2 Distributor-க்கு மேலும் ஒரு Lot Code வழங்குவது

1. **Select Distributor** பகுதியில் Distributor-ஐத் தேர்வு செய்யவும்.
2. தேவையான Lot Code-ஐத் தேர்வு செய்யவும்.
3. அந்த Lot Code-க்கான schemes மற்றும் rates-ஐத் தேர்வு செய்யவும்.
4. **Save Distributor** அழுத்தவும்.

ஒவ்வொரு Lot Code-க்கும் Scheme/Rate தனியாகச் சேமிக்கப்படும்.

### 6.3 Select All

**Select All** தற்போதைய Lot Code-ல் தெரியும் schemes அனைத்தையும் மட்டும் tick செய்யும். மற்ற Lot Code assignments மாற்றப்படாது.

### 6.4 Existing Distributor rate மாற்றுதல்

1. Distributor-ஐத் தேர்வு செய்யவும்.
2. Lot Code-ஐத் தேர்வு செய்யவும்.
3. ஏற்கனவே சேமித்த schemes மற்றும் rates தானாக load ஆகும்.
4. தேவையான மாற்றங்களைச் செய்யவும்.
5. **Save Distributor** அழுத்தவும்.

## 7. Schemes

### 7.1 Scheme List

Scheme List-ல் Scheme name, pattern மற்றும் 4D/3D/2D/Single Digit பரிசுகள் தெரியும்.

### 7.2 புதிய Scheme உருவாக்குதல்

1. **Schemes** tab-ஐத் திறக்கவும்.
2. Scheme name மற்றும் pattern உள்ளிடவும்.
3. 4 Digit, 3 Digit, 2 Digit மற்றும் Single Digit prize values உள்ளிடவும்.
4. பொருந்தாத prize level-க்கு `0` உள்ளிடவும்.
5. **Create Scheme** அழுத்தவும்.

புதிய Scheme உருவாக்கிய பிறகு அதை தேவையான Lot Code-க்கு இணைக்க வேண்டும்.

## 8. Lot Codes

Lot Code எடுத்துக்காட்டுகள்:

- KL — Kerala
- DR — Dear

### 8.1 Lot Code configuration

1. **Lot Codes** tab-ஐத் திறக்கவும்.
2. Lot Code-ஐத் தேர்வு செய்யவும்.
3. அந்த Lot Code-ல் கிடைக்க வேண்டிய schemes-ஐத் தேர்வு செய்யவும்.
4. Morning, Afternoon மற்றும் Evening timings தேவைப்பட்டால் அமைக்கவும்.
5. **Save Lot Code configuration** அழுத்தவும்.

முதல் 13 schemes பொதுவான Scheme Master பட்டியலில் இருக்கும். Additional 4D schemes-ஐ Lot Code தேவைக்கேற்ப இணைக்கலாம்.

### 8.2 புதிய Lot Code சேர்ப்பது

1. Lot Code மற்றும் Lot Code name உள்ளிடவும்.
2. **Add Lot Code** அழுத்தவும்.
3. பின்னர் அதன் schemes மற்றும் timings-ஐ configure செய்யவும்.

## 9. பரிந்துரைக்கப்பட்ட தினசரி நடைமுறை

1. Server இயங்குகிறதா என்று சரிபார்க்கவும்.
2. Lot Code மற்றும் நேர அட்டவணையைச் சரிபார்க்கவும்.
3. Distributor assignments மற்றும் rates-ஐச் சரிபார்க்கவும்.
4. விற்பனை தொடங்கிய பிறகு Dashboard-ஐ கண்காணிக்கவும்.
5. Result வெளியிடுவதற்கு முன் Profit Preview பார்க்கவும்.
6. சரியான Lot Code, Show மற்றும் Result Date தேர்வை உறுதிசெய்யவும்.
7. சரியான 4 இலக்க DABC எண்ணை உறுதிசெய்யவும்.
8. Result வெளியிட்டு Distributor Profit/Loss report-ஐப் பார்க்கவும்.

### Result நிரந்தர Lock

- Profit Preview-ல் தேர்வு செய்யப்பட்ட ஒரே **Lot Code + Show + Date** விற்பனைகள் மட்டுமே முழுமையாகச் சேர்க்கப்படும்.
- Result publish ஆனவுடன் அந்த slot-இன் அனைத்து tickets-க்கும் WIN/LOSE மற்றும் மொத்த prize நிரந்தரமாகப் பதிவு செய்யப்படும்.
- ஒரே Lot Code + Show + Date-க்கு இரண்டாவது Result publish செய்ய முடியாது.
- Published Result-க்கு edit/delete API கிடையாது.

## 10. முக்கிய பாதுகாப்பு விதிகள்

- **Security** tab-ல் Result Password மற்றும் Management Password ஆகியவற்றை தனித்தனியாக அமைக்கவும்.
- Result publish செய்ய **Result Password** கட்டாயம்.
- Scheme, Lot Code, Distributor மற்றும் rate மாற்றங்களுக்கு **Management Password** கட்டாயம்.
- தனி action passwords அமைக்கும் வரை Super Admin login password தற்காலிகமாக பயன்படுத்தப்படும்.
- Publish செய்யப்பட்ட Result-ஐ edit அல்லது delete செய்ய முடியாது.
- Password மதிப்புகள் plain text-ஆக சேமிக்கப்படாது; பாதுகாப்பான hash மட்டும் சேமிக்கப்படும்.
- Super Admin password மற்றும் இரண்டு action passwords-ஐ பாதுகாப்பாக வைத்திருக்கவும்.
- ஒரே mobile number-ல் இரண்டு accounts உருவாக்க வேண்டாம்.
- Distributor rate-ஐச் சேமிப்பதற்கு முன் Lot Code-ஐ உறுதிசெய்யவும்.
- Scheme prize மற்றும் rate இரண்டையும் குழப்ப வேண்டாம்.
- Result publish செய்வதற்கு முன் 4 இலக்க DABC எண்ணையும் Profit Preview கணக்கையும் இரண்டு முறை சரிபார்க்கவும்.
- பயன்பாடு முடிந்ததும் **Sign out** செய்யவும்.

## 11. Software License

- புதிய installation முதன்முதலில் இயங்கும் நேரத்திலிருந்து 7 நாள் Trial தொடங்கும்.
- **License** tab-ல் Status, மீதமுள்ள நாட்கள், Trial முடியும் நேரம் மற்றும் Device ID தெரியும்.
- Trial முடிந்ததும் பழைய தரவு அழிக்கப்படாது; Ticket Entry மற்றும் Result Publish மட்டும் lock செய்யப்படும்.
- கணினி நேரத்தை பின்னால் மாற்றுவது Trial காலத்தை நீட்டிக்காது.
- முழுமையான renewal/activation மற்றும் remote suspend வசதி Online License Server இணைக்கும் கட்டத்தில் செயல்படுத்தப்படும்.

## 12. Weekly Accounts

- ஒரு வாரம் திங்கட்கிழமை 00:00 முதல் ஞாயிற்றுக்கிழமை 23:59 வரை கணக்கிடப்படும்.
- Distributor வாரியாக Ticket Quantity, Sales, Prize, Amount Due, Received மற்றும் Balance காட்டப்படும்.
- தற்போதைய கணக்கு: `Amount Due = Ticket Sales - Prize`; `Balance = Amount Due - Received`.
- ஒவ்வொரு தேதிக்கும் `Daily Final Amount = Sales - Prize - Expenses` என்று தனியாகக் காட்டப்படும்.
- செலவு ஏற்பட்ட தேதியில் Amount மற்றும் Note பதிவு செய்யலாம்; Management Password கட்டாயம்.
- வார இறுதி நிகரத் தொகை: `Weekly Final Net = Total Sales - Total Prize - Total Expenses`.
- வேறு வாரத்தைப் பார்க்க அந்த வாரத்திற்குள் உள்ள ஏதாவது ஒரு தேதியைத் தேர்வு செய்யலாம்.
- பணம் வந்ததும் Amount, Reference/Note மற்றும் Management Password உள்ளிட்டு **Received** அழுத்தவும்.
- ஒவ்வொரு payment பதிவும் Audit History-ல் பாதுகாக்கப்படும்.

## 13. நிரந்தர Data மற்றும் Ticket Snapshot

- Users, Schemes, Lot Codes, Tickets, Results, Payments, Expenses மற்றும் Security settings server restart ஆனாலும் அழியாது.
- ஒவ்வொரு Ticket விற்பனை நேரத்திலும் MRP, Distributor Rate, Minimum Rate மற்றும் Prize structure snapshot ஆகப் பதிவு செய்யப்படும்.
- பின்னர் Scheme Rate அல்லது Prize மாற்றப்பட்டாலும் ஏற்கனவே விற்ற Ticket கணக்கு மாறாது.
- Distributor வசூல்: `Snapshot Distributor Rate × Quantity − Settled Prize`.
- Minimum Profit Target அடையாத Result சாதாரணமாக publish ஆகாது. Super Admin override தேர்வு, காரணம் மற்றும் Result Password இருந்தால் மட்டும் audit உடன் அனுமதிக்கப்படும்.
