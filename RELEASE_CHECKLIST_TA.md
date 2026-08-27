# Number Game System — Release Checklist

## GitHub-ல் சேமிக்கப்படுவது

- Backend API source code
- Super Admin, Distributor மற்றும் Seller web panels
- Android Seller application source code
- PostgreSQL database schema
- Docker configuration
- Tests மற்றும் Tamil user guides

## GitHub-ல் சேமிக்கப்படாத பாதுகாப்பான தரவு

- உண்மையான விற்பனை மற்றும் Result records
- User password hashes
- Result/Management password hashes
- Session secret
- `.env` production settings
- Backup files
- APK build file (GitHub Release asset ஆக தனியாக upload செய்ய வேண்டும்)

## Release files

- Android Seller: `NumberGame-Seller-Android.apk`
- Windows EXE: தற்போது தேவையில்லை. Admin மற்றும் Distributor browser-ல் இயங்குகின்றன.
- Server: Node.js backend + PostgreSQL production database

## Productionக்கு முன் கட்டாய வேலைகள்

1. Production server/domain தேர்வு செய்ய வேண்டும்.
2. HTTPS certificate அமைக்க வேண்டும்.
3. PostgreSQL database மற்றும் automatic backup அமைக்க வேண்டும்.
4. Default Super Admin password மாற்ற வேண்டும்.
5. Android APK-ஐ production server URL உடன் build செய்ய வேண்டும்.
6. முழு workflow test செய்து version number வழங்க வேண்டும்.
7. Private GitHub repository மற்றும் Release உருவாக்க வேண்டும்.

## ஒவ்வொரு புதிய versionக்கும்

1. Automated tests ஓட்டவும்.
2. Android code check செய்யவும்.
3. APK build செய்து real phone-ல் சோதிக்கவும்.
4. Source code commit செய்யவும்.
5. GitHub Release-ல் APK மற்றும் release notes upload செய்யவும்.
