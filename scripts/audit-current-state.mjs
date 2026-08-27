import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { evaluateTicket } from '../backend-api/src/services/prize-engine.js';

const data = JSON.parse(await readFile(new URL('../backend-api/data/application-data.json', import.meta.url), 'utf8'));
const validationDistributors = data.users.filter((user) => user.role === 'DISTRIBUTOR' && user.name.startsWith('Validation Distributor'));
const validationSellers = data.users.filter((user) => user.role === 'SELLER' && user.name.startsWith('Validation Seller'));
const directSellers = data.users.filter((user) => user.role === 'SELLER' && user.name === 'Validation Direct Seller');
const auditSellers = [...validationSellers, ...directSellers];

const drawKey = (record) => `${record.boardId}|${record.showId}|${record.resultDate}`;
const drawsByScope = new Map(data.draws.map((draw) => [drawKey(draw), draw]));
const drawScopes = data.draws.map(drawKey);
const duplicateDrawScopes = drawScopes.filter((key, index) => drawScopes.indexOf(key) !== index);

function expectedPrize(ticket, draw) {
  const type = ticket.scheme.startsWith('FOUR') ? 'FOUR_DIGIT'
    : ticket.scheme.startsWith('THREE') ? 'THREE_DIGIT'
      : ticket.scheme.startsWith('TWO') ? 'TWO_DIGIT' : 'ONE_DIGIT';
  const scheme = ['FOUR_DIGIT', 'THREE_DIGIT'].includes(type)
    ? { type, prizes: ticket.prizeSnapshot }
    : { type, prize: type === 'TWO_DIGIT' ? ticket.prizeSnapshot?.two : ticket.prizeSnapshot?.one };
  return evaluateTicket(ticket.number, draw.winningNumber, scheme, ticket.catalogPattern).prize * ticket.quantity;
}

const sellerChecks = auditSellers.map((seller) => {
  const tickets = data.tickets.filter((ticket) => ticket.sellerId === seller.id);
  const settled = tickets.filter((ticket) => ticket.drawId);
  const prizeMismatches = settled.filter((ticket) => {
    const draw = data.draws.find((item) => item.id === ticket.drawId);
    return !draw || ticket.prize !== expectedPrize(ticket, draw);
  });
  return {
    id: seller.id,
    name: seller.name,
    parentId: seller.parentId,
    quantity: tickets.reduce((sum, ticket) => sum + ticket.quantity, 0),
    entryRows: tickets.length,
    settledRows: settled.length,
    winningRows: tickets.filter((ticket) => ticket.status === 'WIN').length,
    losingRows: tickets.filter((ticket) => ticket.status === 'LOSE').length,
    activeRows: tickets.filter((ticket) => ticket.status === 'ACTIVE').length,
    prizeMismatches: prizeMismatches.length
  };
});

const distributorChecks = validationDistributors.map((distributor) => ({
  id: distributor.id,
  name: distributor.name,
  sellerCount: validationSellers.filter((seller) => seller.parentId === distributor.id).length,
  bonusPercentage: data.bonusRules.filter((rule) => rule.beneficiaryId === distributor.id && rule.enabled).at(-1)?.percentage ?? 0
}));

const directSellerCorrect = directSellers.length === 1 && directSellers[0].parentId === 'admin-1';
const report = {
  generatedAt: new Date().toISOString(),
  hierarchy: {
    distributorCount: validationDistributors.length,
    childSellerCount: validationSellers.length,
    directSellerCount: directSellers.length,
    directSellerCorrect,
    distributors: distributorChecks
  },
  sellerChecks,
  results: {
    published: data.draws.length,
    locked: data.draws.filter((draw) => draw.locked === true).length,
    duplicateScopes: [...new Set(duplicateDrawScopes)],
    referencedScopes: [...new Set(data.tickets.filter((ticket) => ticket.drawId).map((ticket) => {
      const draw = data.draws.find((item) => item.id === ticket.drawId);
      return draw ? drawKey(draw) : `missing:${ticket.drawId}`;
    }))]
  }
};

report.passed = report.hierarchy.distributorCount === 2
  && report.hierarchy.childSellerCount === 4
  && report.hierarchy.directSellerCount === 1
  && report.hierarchy.directSellerCorrect
  && distributorChecks.every((item) => item.sellerCount === 2 && item.bonusPercentage >= 0 && item.bonusPercentage <= 50)
  && sellerChecks.every((item) => item.quantity >= 100 && item.activeRows === 0 && item.prizeMismatches === 0)
  && report.results.published === report.results.locked
  && report.results.duplicateScopes.length === 0;

await mkdir(new URL('../reports/', import.meta.url), { recursive: true });
await writeFile(new URL('../reports/current-state-audit.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
