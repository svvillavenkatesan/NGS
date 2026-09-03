const cents = (value) => Math.round(Number(value ?? 0) * 100);
const invalid = (message) => { const error = new Error(message); error.status = 400; throw error; };

export function dailyRange(from, to, today) {
  const valid = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  to ||= today;
  if (!valid(to) || to > today) invalid('Select a valid date, no later than today');
  from ||= new Date(Date.parse(to) - 14 * 86400000).toISOString().slice(0, 10);
  if (!valid(from) || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 365) invalid('Select a valid range of up to 366 days');
  return { from, to };
}

export function dailyLedger(reports, payments, from, to) {
  const days = [];
  for (let time = Date.parse(to); time >= Date.parse(from); time -= 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    const rows = reports.filter((row) => row.businessDate === date);
    const transactions = payments.filter((row) => row.accountDate === date);
    const sum = (field) => rows.reduce((total, row) => total + cents(row[field]), 0);
    const sales = sum('totalSales'), prize = sum('totalPrize'), bonus = sum('totalBonus');
    const received = transactions.filter((row) => row.direction === 'RECEIVED').reduce((total, row) => total + cents(row.amount), 0);
    const paid = transactions.filter((row) => row.direction === 'PAID').reduce((total, row) => total + cents(row.amount), 0);
    const net = sales - prize - bonus, balance = net - received + paid;
    const provisional = rows.some((row) => row.status !== 'FINALIZED');
    days.push({ date, quantity: rows.reduce((total, row) => total + Number(row.totalQuantity ?? 0), 0), sales: sales / 100, prize: prize / 100, bonus: bonus / 100, net: net / 100, received: received / 100, paid: paid / 100, balance: balance / 100, provisional, settled: balance === 0 && (rows.length > 0 || transactions.length > 0), transactions });
  }
  return days;
}

export function validateDailyPayment(body, day) {
  if (cents(body.expectedBalance) !== cents(day.balance) || body.expectedBalance == null) {
    const error = new Error('Balance changed. Refresh the account and try again.'); error.status = 409; throw error;
  }
  const direction = day.balance > 0 ? 'RECEIVED' : 'PAID';
  const amount = body.settle === true ? Math.abs(day.balance) : Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - cents(amount)) > 0.00001 || cents(amount) > Math.abs(cents(day.balance))) invalid('Enter an amount within the outstanding balance, with at most 2 decimals');
  if (body.direction !== direction) invalid('Payment direction does not match the balance');
  return { direction, amount: cents(amount) / 100 };
}
