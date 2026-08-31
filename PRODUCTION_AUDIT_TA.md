# NGS Production Audit — 31-08-2026

## முடிக்கப்பட்ட பாதுகாப்பு வேலைகள்

- Owner → பல Super Admin → தனித்தனி Seller hierarchy மற்றும் limit.
- Super Admin data, Seller list, reports, weekly accounts மற்றும் action passwords தனித்தனியாகப் பிரிக்கப்பட்டுள்ளன.
- Password hashing, expiring signed sessions மற்றும் password மாற்றியதும் பழைய session முடக்கம்.
- Result-ஐ Lot Code + Show + Date அடிப்படையில் ஒருமுறை publish செய்ததும் permanent lock.
- Result publish செய்ய entry close ஆன பிறகு ஒரு நிமிடம் காத்திருக்கும் விதி.
- Login rate limit, 1 MB request limit மற்றும் browser security headers.
- PostgreSQL-ஐ இணையத்திற்கு publish செய்யாத Docker network.
- Caddy HTTPS reverse proxy, automatic certificate renewal மற்றும் production environment template.
- Production தொடங்கும்போது demo Owner/Admin password இருந்தால் server இயங்காமல் தடுக்கும் பாதுகாப்பு.
- JSON/PostgreSQL backup மற்றும் restore scripts repository-ல் உள்ளன.
- JSON backup ஒவ்வொன்றிலும் SHA-256 checksum manifest உருவாகிறது; `scripts/verify-backup.ps1` மூலம் restore-க்கு முன் சரிபார்க்கலாம்.
- Android release APK-க்கு HTTPS server URL மற்றும் தனிப்பட்ட signing key கட்டாயமாக்கப்பட்டுள்ளது.
- 20 automated tests வெற்றிகரமாக இயங்குகின்றன.

## Production தொடங்குவதற்கு முன் கட்டாயமாக செய்ய வேண்டியது

1. சட்ட அனுமதி, வரி, KYC/AML, வயது சரிபார்ப்பு மற்றும் responsible-gaming விதிகளை வழக்கறிஞர் மூலம் உறுதி செய்ய வேண்டும்.
2. சட்டபூர்வமான domain மற்றும் production server வாங்க வேண்டும்.
3. `.env.production.example`-ஐ `.env` ஆக copy செய்து அனைத்து example secrets-ஐ மாற்ற வேண்டும்.
4. Final Android application ID, release signing key மற்றும் HTTPS server URL அமைத்து signed APK உருவாக்க வேண்டும்.
5. PostgreSQL encrypted off-server daily backup மற்றும் restore drill அமைக்க வேண்டும்.
6. உண்மைப் பணம் பயன்படுத்துவதற்கு முன் parallel load test, reconciliation test மற்றும் independent security test செய்ய வேண்டும்.

## முக்கிய வரம்புகள்

- தற்போதைய தொகைகள் decimal number-ஆக உள்ளன. மிகப்பெரிய production பயன்பாட்டிற்கு paise integer அல்லது database decimal வகைக்கு மாற்றுவது பாதுகாப்பானது.
- Local seven-day licence file ஒரு basic control மட்டுமே; விற்பனைக்கான வலுவான licence server பின்னர் தேவை.
- Tor/Onion மூலம் சட்டவிரோத சேவையை மறைப்பது இந்த deployment திட்டத்தின் பகுதி அல்ல.

## HTTPS தொடங்கும் முறை

Domain DNS server-ஐ நோக்கி அமைந்த பின்:

```powershell
Copy-Item .env.production.example .env
docker compose up -d --build
```

Caddy தானாக HTTPS certificate பெற்று renew செய்யும். Database public port-ல் திறக்கப்படாது.
