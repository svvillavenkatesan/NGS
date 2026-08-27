# Distributor Control Center கையேடு

## Login

- URL: `http://localhost:4000/distributor`
- Demo mobile: `9000000002`
- Temporary password: `1111122222`

## Overview

தற்போதைய வார Customer Sales, Prize, Admin Settlement, Distributor Margin மற்றும் சமீபத்திய Tickets காட்டப்படும்.

## Weekly Accounts

- திங்கட்கிழமை முதல் ஞாயிற்றுக்கிழமை வரை கணக்கு.
- `Admin Settlement = Ticket snapshot Distributor Rate total - Settled Prize`.
- `Distributor Margin = Customer Sales - Ticket snapshot Distributor Rate total`.
- ஒவ்வொரு நாளின் Sales, Prize, Settlement மற்றும் Margin தனியாகக் காட்டப்படும்.
- பழைய வாரத்தை தேதி தேர்வு செய்து பார்க்கலாம்.

## Sales

Distributor network-ன் Sellers விற்ற Tickets மட்டும் தெரியும். மற்ற Distributor தரவு தெரியாது.

## Network

Distributor தனது கீழ் Seller account மட்டும் உருவாக்கலாம். தனி Sub-Distributor panel கிடையாது. Seller-க்கு 0–50% commission அமைத்தால் அவர் Seller panel-ஐயே பயன்படுத்தி commission பெறுவார். Percentage-ஐ பின்னரும் மாற்றலாம்; பழைய Tickets விற்பனை நேர snapshot-ஐத் தொடரும்.

## Schemes

Super Admin வழங்கிய Lot Codes, Schemes மற்றும் Distributor Rates மட்டும் தெரியும். Scheme Master, Minimum Rate, Prize அல்லது Result மாற்ற முடியாது.

## Results

Distributor-க்கு வழங்கப்பட்ட Lot Codes-ன் published and locked Results மட்டும் காட்டப்படும். Distributor Result publish செய்ய முடியாது.
