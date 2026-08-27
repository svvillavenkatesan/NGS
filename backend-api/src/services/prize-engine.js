const digitsOnly = (value, length, label) => {
  const text = String(value);
  if (!new RegExp(`^\\d{${length}}$`).test(text)) {
    throw new TypeError(`${label} must contain exactly ${length} digits`);
  }
  return text;
};

export function evaluateTicket(ticketNumber, winningNumber, scheme, pattern = '') {
  const winning = digitsOnly(winningNumber, 4, 'winningNumber');
  const [d, a, b, c] = winning;
  const type = scheme?.type;
  const premium = Boolean(scheme?.premium);

  if (type === 'FOUR_DIGIT') {
    const ticket = digitsOnly(ticketNumber, 4, 'ticketNumber');
    const prizes = scheme.prizes ?? {};
    if (ticket === `${d}${a}${b}${c}`) return winner(prizes.four, 'DABC');
    if (ticket.slice(1) === `${a}${b}${c}`) return winner(prizes.three, 'ABC');
    if (ticket.slice(2) === `${b}${c}`) return winner(prizes.two, 'BC');
    if (ticket.slice(3) === c) return winner(prizes.one, 'C');
  }

  if (type === 'THREE_DIGIT') {
    const ticket = digitsOnly(ticketNumber, 3, 'ticketNumber');
    const prizes = scheme.prizes ?? {};
    if (ticket === `${a}${b}${c}`) return winner(prizes.three, 'ABC');
    if (ticket.slice(1) === `${b}${c}`) return winner(prizes.two, 'BC');
    if (ticket.slice(2) === c) return winner(prizes.one, 'C');
  }

  if (type === 'TWO_DIGIT') {
    const ticket = digitsOnly(ticketNumber, 2, 'ticketNumber');
    const pairs = { AB: `${a}${b}`, AC: `${a}${c}`, BC: `${b}${c}` };
    if ((pairs[pattern] ? ticket === pairs[pattern] : Object.values(pairs).includes(ticket))) {
      return winner(scheme.prize ?? (premium ? 2000 : 1000), pairs[pattern] ? pattern : '2 DIGIT');
    }
  }

  if (type === 'ONE_DIGIT') {
    const ticket = digitsOnly(ticketNumber, 1, 'ticketNumber');
    const singles = { A: a, B: b, C: c };
    if ((singles[pattern] ? ticket === singles[pattern] : Object.values(singles).includes(ticket))) {
      return winner(scheme.prize ?? (premium ? 250 : 100), singles[pattern] ? pattern : '1 DIGIT');
    }
  }

  return { isWinner: false, prize: 0, match: null };
}

function winner(prize, match) {
  const amount = Number(prize);
  if (!Number.isFinite(amount) || amount < 0) throw new TypeError('Prize must be a non-negative number');
  return { isWinner: true, prize: amount, match };
}
