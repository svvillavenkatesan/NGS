import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

const api = String.fromEnvironment('API_BASE_URL',
    defaultValue: 'http://10.0.2.2:4000');
void main() {
  if (kReleaseMode && !api.startsWith('https://')) {
    throw StateError('Release APK requires an HTTPS API_BASE_URL.');
  }
  runApp(const App());
}
const client = 'number-game-seller-android/1.0.0';
Map<String, String> headers([String? token]) => {
      'content-type': 'application/json',
      'x-seller-client': client,
      if (token != null) 'authorization': 'Bearer $token'
    };

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext c) => MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
              seedColor: const Color(0xfff2b84b), brightness: Brightness.dark),
          useMaterial3: true),
      home: const Login());
}

class Login extends StatefulWidget {
  const Login({super.key});
  @override
  State<Login> createState() => _Login();
}

class _Login extends State<Login> {
  final phone = TextEditingController(), password = TextEditingController();
  String error = '';
  bool busy = false;
  Future<void> go() async {
    setState(() => busy = true);
    try {
      final r = await http.post(Uri.parse('$api/api/auth/login'),
          headers: headers(),
          body: jsonEncode({'phone': phone.text, 'password': password.text}));
      final d = jsonDecode(r.body);
      if (r.statusCode != 200) {
        throw Exception(d['error']);
      }
      if (d['user']['role'] != 'SELLER') {
        throw Exception('Seller account required');
      }
      if (mounted) {
        Navigator.pushReplacement(context,
            MaterialPageRoute(builder: (_) => Entry(token: d['token'])));
      }
    } catch (e) {
      setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext c) => Scaffold(
        body: SafeArea(
          child: Center(
            child: SizedBox(
              width: 420,
              child: ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.all(24),
                children: [
                  Text('SELLER',
                      style: Theme.of(c).textTheme.labelMedium?.copyWith(
                          letterSpacing: 1.4,
                          color: Theme.of(c).colorScheme.primary)),
                  const SizedBox(height: 12),
                  TextField(
                      controller: phone,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(
                          labelText: 'Phone', border: OutlineInputBorder())),
                  const SizedBox(height: 14),
                  TextField(
                      controller: password,
                      obscureText: true,
                      onSubmitted: (_) => go(),
                      decoration: const InputDecoration(
                          labelText: 'Password', border: OutlineInputBorder())),
                  const SizedBox(height: 18),
                  FilledButton(
                      onPressed: busy ? null : go,
                      child: Text(busy ? 'Signing in...' : 'Sign in')),
                  if (error.isNotEmpty)
                    Text(error,
                        style: const TextStyle(color: Colors.redAccent)),
                ],
              ),
            ),
          ),
        ),
      );
}

class Entry extends StatefulWidget {
  const Entry({super.key, required this.token});
  final String token;
  @override
  State<Entry> createState() => _Entry();
}

class _Entry extends State<Entry> {
  final number = TextEditingController(),
      qty = TextEditingController(text: '1');
  final numberFocus = FocusNode();
  final List<Map<String, dynamic>> cart = [];
  final List<Map<String, dynamic>> previousBills = [];
  Map<String, dynamic>? data;
  String? boardId, showId, schemeId;
  bool box = false, busy = true, saving = false;
  String note = '';
  DateTime now = DateTime.now();
  Timer? timer;
  List<dynamic> get boards => data?['boards'] ?? [];
  List<dynamic> get schemes => data?['schemeCatalog'] ?? [];
  Map<String, dynamic>? get board => boards
      .cast<Map<String, dynamic>>()
      .where((x) => x['id'] == boardId)
      .firstOrNull;
  List<Map<String, dynamic>> get available => schemes
      .cast<Map<String, dynamic>>()
      .where((x) => (board?['schemeIds'] ?? []).contains(x['id']))
      .toList();
  Map<String, dynamic>? get scheme =>
      available.where((x) => x['id'] == schemeId).firstOrNull;
  List<Map<String, dynamic>> get shows => (board?['schedules'] ?? [])
      .cast<Map<String, dynamic>>()
      .where((x) => x['enabled'] == true)
      .toList();
  String? nextShowId([Map<String, dynamic>? selectedBoard]) {
    final selectedShows = ((selectedBoard?['schedules'] ?? shows) as List)
        .cast<Map<String, dynamic>>()
        .where((x) => x['enabled'] == true)
        .toList();
    if (selectedShows.isEmpty) return null;
    final currentMinutes = now.hour * 60 + now.minute;
    final ordered = [...selectedShows]
      ..sort((a, b) => _endMinutes(a).compareTo(_endMinutes(b)));
    return ordered.where((x) {
      final start = x['startTime'].split(':').map(int.parse).toList();
      return currentMinutes >= start[0] * 60 + start[1] &&
          currentMinutes <= _endMinutes(x);
    }).firstOrNull?['id'];
  }

  int _endMinutes(Map<String, dynamic> show) {
    final value = show['effectiveEndTime'] ?? show['endTime'];
    final parts = value.split(':').map(int.parse).toList();
    return parts[0] * 60 + parts[1];
  }

  String showName(Map<String, dynamic> show) =>
      '${show['label']}'.replaceFirst('DEAR', 'DR');

  void focusNumberAndKeyboard() {
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      numberFocus.requestFocus();
      await Future<void>.delayed(const Duration(milliseconds: 120));
      if (mounted) {
        await SystemChannels.textInput.invokeMethod<void>('TextInput.show');
      }
    });
  }

  String get pattern => scheme?['pattern'] ?? '';
  int get length => pattern == 'DABC'
      ? 4
      : pattern == 'ABC'
          ? 3
          : (['AB', 'AC', 'BC'].contains(pattern) ||
                  schemeId == 'scheme-all-doubles')
              ? 2
              : 1;
  String typeFor(String p) => p == 'DABC'
      ? 'FOUR_DIGIT'
      : p == 'ABC'
          ? 'THREE_DIGIT'
          : ['AB', 'AC', 'BC'].contains(p)
              ? 'TWO_DIGIT_STANDARD'
              : 'ONE_DIGIT_STANDARD';
  @override
  void initState() {
    super.initState();
    load();
    timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => now = DateTime.now());
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    number.dispose();
    qty.dispose();
    numberFocus.dispose();
    super.dispose();
  }

  Future<void> load() async {
    try {
      final r = await http.get(Uri.parse('$api/api/dashboard'),
          headers: headers(widget.token));
      final d = jsonDecode(r.body);
      if (r.statusCode != 200) throw Exception(d['error']);
      final billsResponse = await http.get(Uri.parse('$api/api/bills/recent'),
          headers: headers(widget.token));
      final recent = jsonDecode(billsResponse.body);
      if (billsResponse.statusCode != 200) throw Exception(recent['error']);
      setState(() {
        data = d;
        previousBills
          ..clear()
          ..addAll((recent as List).cast<Map<String, dynamic>>());
        final firstBoard = boards.firstOrNull as Map<String, dynamic>?;
        boardId = firstBoard?['id'];
        showId = nextShowId(firstBoard);
        schemeId = available.firstOrNull?['id'];
        busy = false;
      });
    } catch (e) {
      setState(() {
        busy = false;
        note = e.toString();
      });
    }
  }

  List<String> permutations(String v) {
    final out = <String>{};
    void walk(String p, String r) {
      if (r.isEmpty) {
        out.add(p);
        return;
      }
      for (var i = 0; i < r.length; i++) {
        walk(p + r[i], r.substring(0, i) + r.substring(i + 1));
      }
    }

    walk('', v);
    return out.toList();
  }

  List<Map<String, dynamic>> targets() {
    final ids = schemeId == 'scheme-all-single'
        ? ['scheme-a', 'scheme-b', 'scheme-c']
        : schemeId == 'scheme-all-doubles'
            ? ['scheme-ab', 'scheme-ac', 'scheme-bc']
            : [schemeId];
    return ids
        .map((id) => schemes
            .cast<Map<String, dynamic>>()
            .where((x) => x['id'] == id)
            .firstOrNull)
        .whereType<Map<String, dynamic>>()
        .toList();
  }

  void add([int? quick]) {
    final n = number.text;
    final q = quick ?? int.tryParse(qty.text) ?? 0;
    if (!RegExp('^\\d{$length}\$').hasMatch(n)) {
      setState(() => note = 'Enter a valid $length digit number');
      return;
    }
    if (q < 1 || q > 1000) {
      setState(() => note = 'Quantity must be 1-1000');
      return;
    }
    final nums = box && length > 1 ? permutations(n) : [n];
    final ts = targets();
    if (cart.length + nums.length * ts.length > 100) {
      setState(() => note = 'Maximum 100 entries');
      return;
    }
    setState(() {
      for (final t in ts) {
        for (final value in nums) {
          final old = cart
              .where((x) =>
                  x['catalogSchemeId'] == t['id'] && x['number'] == value)
              .firstOrNull;
          if (old != null) {
            old['quantity'] += q;
          } else {
            cart.add({
              'boardId': boardId,
              'showId': showId,
              'boardCode': board?['code'],
              'catalogSchemeId': t['id'],
              'catalogSchemeName': t['name'],
              'scheme': typeFor(t['pattern']),
              'number': value,
              'quantity': q,
              'unitPrice': (t['mrp'] as num).toDouble()
            });
          }
        }
      }
      note = '${nums.length * ts.length} entries added';
      number.clear();
      qty.text = '1';
      box = false;
    });
    focusNumberAndKeyboard();
  }

  Future<void> settle({bool print = false}) async {
    if (saving || cart.isEmpty) return;
    setState(() => saving = true);
    try {
      final items = cart
          .map((x) => {
                'boardId': x['boardId'],
                'showId': x['showId'],
                'catalogSchemeId': x['catalogSchemeId'],
                'scheme': x['scheme'],
                'number': x['number'],
                'quantity': x['quantity']
              })
          .toList();
      final r = await http.post(Uri.parse('$api/api/tickets/batch'),
          headers: headers(widget.token), body: jsonEncode({'items': items}));
      final d = jsonDecode(r.body);
      if (r.statusCode != 201) throw Exception(d['error']);
      final bill = (d['bill'] as Map).cast<String, dynamic>();
      setState(() {
        cart.clear();
        previousBills.insert(0, bill);
        if (previousBills.length > 5) previousBills.removeLast();
        note =
            '${bill['billNumber']} · ${d['quantity']} tickets · ₹${d['total']}';
      });
      if (print) await printBill(bill);
      focusNumberAndKeyboard();
    } catch (e) {
      setState(() => note = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> printBill(Map<String, dynamic> bill) async {
    final document = pw.Document();
    final items = (bill['items'] as List).cast<Map<String, dynamic>>();
    const width = 2 * PdfPageFormat.inch;
    final height = (105 + items.length * 15).clamp(145, 1200).toDouble();
    final format =
        PdfPageFormat(width, height, marginAll: 3 * PdfPageFormat.mm);
    document.addPage(pw.Page(
        pageFormat: format,
        build: (_) => pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.stretch,
                children: [
                  pw.Text('${bill['billNumber']}',
                      textAlign: pw.TextAlign.center,
                      style: const pw.TextStyle(
                          fontSize: 10, fontWeight: pw.FontWeight.bold)),
                  pw.Text('${bill['boardCode']}  ${bill['showLabel']}',
                      textAlign: pw.TextAlign.center,
                      style: const pw.TextStyle(fontSize: 7)),
                  pw.Text('${bill['businessDate']}',
                      textAlign: pw.TextAlign.center,
                      style: const pw.TextStyle(fontSize: 7)),
                  pw.Divider(thickness: .5),
                  ...items.map((item) => pw.Padding(
                      padding: const pw.EdgeInsets.symmetric(vertical: 1.5),
                      child: pw.Row(children: [
                        pw.Expanded(
                            flex: 5,
                            child: pw.Text(
                                '${item['scheme']} ${item['number']}',
                                style: const pw.TextStyle(fontSize: 7))),
                        pw.Expanded(
                            flex: 2,
                            child: pw.Text('X ${item['quantity']}',
                                textAlign: pw.TextAlign.right,
                                style: const pw.TextStyle(fontSize: 7))),
                        pw.Expanded(
                            flex: 3,
                            child: pw.Text('Rs ${item['amount']}',
                                textAlign: pw.TextAlign.right,
                                style: const pw.TextStyle(fontSize: 7)))
                      ]))),
                  pw.Divider(thickness: .5),
                  pw.Text(
                      'QTY ${bill['totalQuantity']}   TOTAL Rs ${bill['total']}',
                      textAlign: pw.TextAlign.right,
                      style: const pw.TextStyle(
                          fontSize: 9, fontWeight: pw.FontWeight.bold))
                ])));
    await Printing.layoutPdf(
        name: '${bill['billNumber']}.pdf',
        format: format,
        dynamicLayout: false,
        onLayout: (_) => document.save());
  }

  void showPreviousBills() {
    showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        builder: (sheetContext) => SafeArea(
            child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 18),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Text('PREVIOUS 5 BILLS',
                      style:
                          TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 10),
                  if (previousBills.isEmpty)
                    const Padding(
                        padding: EdgeInsets.all(24),
                        child: Text('No previous bills')),
                  ...previousBills.take(5).map((bill) => ListTile(
                      dense: true,
                      title: Text('${bill['billNumber']}'),
                      subtitle: Text(
                          '₹${bill['total']}  ·  Qty ${bill['totalQuantity']}'),
                      trailing: IconButton(
                          tooltip: 'Print again',
                          icon: const Icon(Icons.print),
                          onPressed: () => printBill(bill))))
                ]))));
  }

  void showResults() {
    final draws =
        (data?['recentDraws'] ?? []).cast<Map<String, dynamic>>().toList();
    String dateKey(DateTime value) =>
        '${value.year}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
    final today = dateKey(now);
    final scopes = boards.cast<Map<String, dynamic>>().expand((selectedBoard) {
      final enabledShows = (selectedBoard['schedules'] ?? [])
          .cast<Map<String, dynamic>>()
          .where((item) => item['enabled'] == true)
          .toList();
      final selectedShows = enabledShows.isEmpty
          ? [<String, dynamic>{'id': 'all-day', 'label': 'All Day'}]
          : enabledShows;
      return selectedShows.map(
          (selectedShow) => {'board': selectedBoard, 'show': selectedShow});
    }).toList();
    Map<String, dynamic>? resultFor(String board, String show, String date) {
      for (final item in draws) {
        if (item['boardId'] == board &&
            item['showId'] == show &&
            item['resultDate'] == date) {
          return item;
        }
      }
      return null;
    }
    showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (sheetContext) => SafeArea(
            child: SizedBox(
                height: MediaQuery.of(sheetContext).size.height * .86,
                child: ListView(padding: const EdgeInsets.all(14), children: [
                  const Text('TODAY RESULTS',
                      style:
                          TextStyle(fontWeight: FontWeight.bold, fontSize: 17)),
                  Text(today),
                  const Divider(),
                  ...scopes.map((scope) {
                    final selectedBoard =
                        scope['board'] as Map<String, dynamic>;
                    final selectedShow =
                        scope['show'] as Map<String, dynamic>;
                    final draw = resultFor('${selectedBoard['id']}',
                        '${selectedShow['id']}', today);
                    return ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        title: Text(
                            '${selectedBoard['code']} · ${showName(selectedShow)}'),
                        subtitle:
                            Text(draw == null ? 'NOT PUBLISHED' : 'PUBLISHED'),
                        trailing: Text(draw?['winningNumber'] ?? '----',
                            style: const TextStyle(
                                fontWeight: FontWeight.bold, fontSize: 20)));
                  }),
                  const SizedBox(height: 12),
                  const Text('PREVIOUS 7 DAYS',
                      style:
                          TextStyle(fontWeight: FontWeight.bold, fontSize: 17)),
                  ...List.generate(7, (index) {
                    final date = dateKey(now.subtract(Duration(days: index + 1)));
                    return ExpansionTile(
                        tilePadding: EdgeInsets.zero,
                        title: Text(date),
                        children: scopes.map((scope) {
                          final selectedBoard =
                              scope['board'] as Map<String, dynamic>;
                          final selectedShow =
                              scope['show'] as Map<String, dynamic>;
                          final draw = resultFor('${selectedBoard['id']}',
                              '${selectedShow['id']}', date);
                          return ListTile(
                              dense: true,
                              title: Text(
                                  '${selectedBoard['code']} · ${showName(selectedShow)}'),
                              trailing: Text(
                                  draw?['winningNumber'] ?? 'NOT PUBLISHED'));
                        }).toList());
                  })
                ]))));
  }

  Future<void> showReports() async {
    try {
      final response = await http.get(Uri.parse('$api/api/reports/sales'),
          headers: headers(widget.token));
      final body = jsonDecode(response.body);
      if (response.statusCode != 200) throw Exception(body['error']);
      final reports = (body as List).cast<Map<String, dynamic>>().toList();
      if (!mounted) return;
      var selectedDate = reports.isEmpty
          ? '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}'
          : '${reports.first['businessDate']}';
      showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          showDragHandle: true,
          builder: (sheetContext) => StatefulBuilder(
              builder: (sheetContext, setSheetState) => SafeArea(
              child: SizedBox(
                  height: MediaQuery.of(sheetContext).size.height * .78,
                  child: Column(children: [
                    Padding(
                        padding: const EdgeInsets.fromLTRB(14, 0, 8, 8),
                        child: Row(children: [
                          const Expanded(
                              child: Text('REPORTS',
                                  style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 16))),
                          TextButton.icon(
                              onPressed: () {
                                Navigator.pop(sheetContext);
                                showChangePassword();
                              },
                              icon: const Icon(Icons.lock_reset, size: 18),
                              label: const Text('PASSWORD'))
                        ])),
                    Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 14),
                        child: Row(children: [
                          const Icon(Icons.calendar_month, size: 19),
                          const SizedBox(width: 8),
                          Expanded(
                              child: Text(selectedDate,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.bold))),
                          TextButton(
                              onPressed: () async {
                                final parts = selectedDate.split('-');
                                final initial = DateTime(
                                    int.parse(parts[0]),
                                    int.parse(parts[1]),
                                    int.parse(parts[2]));
                                final picked = await showDatePicker(
                                    context: sheetContext,
                                    initialDate: initial,
                                    firstDate: DateTime(2020),
                                    lastDate: DateTime.now());
                                if (picked != null) {
                                  setSheetState(() => selectedDate =
                                      '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}');
                                }
                              },
                              child: const Text('SELECT DATE'))
                        ])),
                    const Divider(height: 8),
                    Expanded(
                        child: reports.where((report) =>
                                    '${report['businessDate']}' == selectedDate).isEmpty
                            ? const Center(child: Text('No reports'))
                            : ListView.separated(
                                padding:
                                    const EdgeInsets.fromLTRB(14, 0, 14, 18),
                                itemCount: reports.where((report) =>
                                    '${report['businessDate']}' == selectedDate).length,
                                separatorBuilder: (_, __) => const Divider(),
                                itemBuilder: (_, index) {
                                  final dayReports = reports.where((report) =>
                                      '${report['businessDate']}' == selectedDate).toList();
                                  final report = dayReports[index];
                                  return ListTile(
                                      dense: true,
                                      contentPadding: EdgeInsets.zero,
                                      title: Text(
                                          '${report['boardCode']} REPORT · ${report['showLabel']}',
                                          style: const TextStyle(
                                              fontWeight: FontWeight.bold)),
                                      subtitle: Text('${report['businessDate']}'),
                                      trailing: Text(
                                          '₹${report['totalSales']}\nPrize ₹${report['totalPrize']}',
                                          textAlign: TextAlign.right,
                                          style:
                                              const TextStyle(fontSize: 11)),
                                      onTap: () {
                                        Navigator.pop(sheetContext);
                                        showReportSuite('${report['id']}');
                                      });
                                }))
                  ])))));
    } catch (e) {
      if (mounted) {
        setState(() => note = e.toString().replaceFirst('Exception: ', ''));
      }
    }
  }

  Future<void> showChangePassword() async {
    final current = TextEditingController();
    final next = TextEditingController();
    await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
              title: const Text('Change Password'),
              content: Column(mainAxisSize: MainAxisSize.min, children: [
                TextField(
                    controller: current,
                    obscureText: true,
                    decoration:
                        const InputDecoration(labelText: 'Current Password')),
                const SizedBox(height: 10),
                TextField(
                    controller: next,
                    obscureText: true,
                    decoration: const InputDecoration(
                        labelText: 'New Password (minimum 8)'))
              ]),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(dialogContext),
                    child: const Text('CANCEL')),
                FilledButton(
                    onPressed: () async {
                      try {
                        final response = await http.put(
                            Uri.parse('$api/api/me/password'),
                            headers: headers(widget.token),
                            body: jsonEncode({
                              'currentPassword': current.text,
                              'newPassword': next.text
                            }));
                        final body = jsonDecode(response.body);
                        if (response.statusCode != 200) {
                          throw Exception(body['error']);
                        }
                        if (!mounted || !dialogContext.mounted) return;
                        Navigator.pop(dialogContext);
                        Navigator.pushAndRemoveUntil(
                            context,
                            MaterialPageRoute(builder: (_) => const Login()),
                            (_) => false);
                      } catch (e) {
                        if (mounted) {
                          setState(() => note =
                              e.toString().replaceFirst('Exception: ', ''));
                        }
                      }
                    },
                    child: const Text('CHANGE'))
              ],
            ));
    current.dispose();
    next.dispose();
  }

  Future<void> showReportSuite(String reportId) async {
    try {
      final response = await http.get(
          Uri.parse('$api/api/reports/seller-suite?reportId=$reportId'),
          headers: headers(widget.token));
      final suite = jsonDecode(response.body);
      if (response.statusCode != 200) throw Exception(suite['error']);
      if (!mounted) return;
      final entries =
          (suite['entryReport'] as List).cast<Map<String, dynamic>>();
      final items = (suite['itemReport'] as List).cast<Map<String, dynamic>>();
      final wins =
          (suite['winningReport'] as List).cast<Map<String, dynamic>>();
      final bills =
          (suite['billWinningReport'] as List).cast<Map<String, dynamic>>();
      Widget schemeRows(List<Map<String, dynamic>> rows) => ListView(
          padding: const EdgeInsets.all(10),
          children: rows
              .map((row) => ListTile(
                  dense: true,
                  title: Text('${row['scheme']}  X ${row['quantity']}'),
                  trailing:
                      Text('₹${row['amount']}  /  Prize ₹${row['winning']}')))
              .toList());
      Widget entryRows() => ListView(
          padding: const EdgeInsets.all(10),
          children: entries
              .map((row) => ListTile(
                  dense: true,
                  title: Text(
                      '${row['scheme']} ${row['enteredNumber']} X ${row['quantity']}'),
                  subtitle: Text('${row['time']}'),
                  trailing: Text(
                      '₹${row['saleAmount']}\nPrize ₹${row['prizeAmount']}',
                      textAlign: TextAlign.right)))
              .toList());
      Widget metrics(Map<String, dynamic> values) => ListView(
          padding: const EdgeInsets.all(14),
          children: values.entries
              .map((entry) => ListTile(
                  dense: true,
                  title: Text(entry.key.replaceAll('_', ' ').toUpperCase()),
                  trailing: Text('${entry.value}',
                      style: const TextStyle(fontWeight: FontWeight.bold))))
              .toList());
      showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          builder: (sheetContext) => DefaultTabController(
              length: 7,
              child: SafeArea(
                  child: SizedBox(
                      height: MediaQuery.of(sheetContext).size.height * .86,
                      child: Column(children: [
                        const TabBar(isScrollable: true, tabs: [
                          Tab(text: 'ENTRY'),
                          Tab(text: 'ITEM'),
                          Tab(text: 'SALES'),
                          Tab(text: 'WINNING'),
                          Tab(text: 'PAYMENT'),
                          Tab(text: 'BILL WINNING'),
                          Tab(text: 'SUMMARY')
                        ]),
                        Expanded(
                            child: TabBarView(children: [
                          entryRows(),
                          schemeRows(items),
                          metrics((suite['salesReport'] as Map)
                              .cast<String, dynamic>()),
                          schemeRows(wins),
                          metrics((suite['paymentReport'] as Map)
                              .cast<String, dynamic>()),
                          ListView(
                              padding: const EdgeInsets.all(10),
                              children: bills
                                  .map((bill) => ListTile(
                                      dense: true,
                                      title: Text('${bill['billNumber']}'),
                                      subtitle: Text(
                                          '${bill['time']} · Qty ${bill['quantity']}'),
                                      trailing: Text(
                                          '₹${bill['amount']}\nPrize ₹${bill['prize']}',
                                          textAlign: TextAlign.right)))
                                  .toList()),
                          metrics((suite['summaryReport'] as Map)
                              .cast<String, dynamic>())
                        ]))
                      ])))));
    } catch (e) {
      if (mounted) {
        setState(() => note = e.toString().replaceFirst('Exception: ', ''));
      }
    }
  }

  String status() {
    final list = (board?['schedules'] ?? []).where((x) => x['enabled'] == true);
    final currentSeconds = now.hour * 3600 + now.minute * 60 + now.second;
    for (final s in list.where((x) => x['id'] == showId)) {
      final a = s['startTime'].split(':').map(int.parse).toList(),
          b = (s['effectiveEndTime'] ?? s['endTime'])
              .split(':')
              .map(int.parse)
              .toList(),
          startSeconds = a[0] * 3600 + a[1] * 60,
          endSeconds = b[0] * 3600 + b[1] * 60 + 59;
      if (currentSeconds >= startSeconds && currentSeconds <= endSeconds) {
        final remaining = endSeconds - currentSeconds;
        final hours = remaining ~/ 3600;
        final minutes = (remaining % 3600) ~/ 60;
        final seconds = remaining % 60;
        return '${showName(s)} · ${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')} left';
      }
      if (currentSeconds < startSeconds) {
        return '${showName(s)} opens ${s['startTime']}';
      }
    }
    return list.isEmpty ? 'All day entry' : 'Entry closed';
  }

  @override
  Widget build(BuildContext c) {
    if (busy) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final total =
        cart.fold<double>(0, (s, x) => s + x['unitPrice'] * x['quantity']);
    return Scaffold(
        body: SafeArea(
            child: ListView(padding: const EdgeInsets.all(14), children: [
          Row(children: [
            Expanded(
                flex: 2,
                child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 7),
                    decoration: BoxDecoration(
                        color: const Color(0xff211133),
                        borderRadius: BorderRadius.circular(9)),
                    child: Column(children: [
                      Text(
                          '${now.day.toString().padLeft(2, '0')}/${now.month.toString().padLeft(2, '0')}/${now.year}',
                          style: const TextStyle(
                              fontWeight: FontWeight.bold, fontSize: 12)),
                      const SizedBox(height: 3),
                      Text(TimeOfDay.fromDateTime(now).format(c),
                          style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                              color: Color(0xffd7b5ff)))
                    ]))),
            const SizedBox(width: 6),
            Expanded(
                flex: 3,
                child: Info('', status())),
            const SizedBox(width: 6),
            SizedBox(
                height: 50,
                child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 10)),
                    onPressed: () => Navigator.pushAndRemoveUntil(
                        context,
                        MaterialPageRoute(builder: (_) => const Login()),
                        (_) => false),
                    child:
                        const Text('EXIT', style: TextStyle(fontSize: 11))))
          ]),
          const SizedBox(height: 10),
          Row(children: [
            Wrap(
                spacing: 5,
                children: boards
                    .map((b) => ChoiceChip(
                        label: Text(b['id'] == 'dear' ? 'DR' : b['code']),
                        selected: boardId == b['id'],
                        onSelected: (_) {
                          final selected = b as Map<String, dynamic>;
                          setState(() {
                            boardId = selected['id'];
                            showId = nextShowId(selected);
                            schemeId = available.firstOrNull?['id'];
                            cart.clear();
                          });
                        }))
                    .toList()),
            const SizedBox(width: 7),
            Expanded(
                child: DropdownButtonFormField<String>(
                    key: ValueKey('$boardId-$showId-show'),
                    initialValue: showId,
                    isExpanded: true,
                    decoration: const InputDecoration(
                        contentPadding:
                            EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                        border: OutlineInputBorder()),
                    items: shows
                        .where(
                            (x) => now.hour * 60 + now.minute <= _endMinutes(x))
                        .map((x) => DropdownMenuItem(
                            value: x['id'] as String,
                            child: Text(showName(x),
                                overflow: TextOverflow.ellipsis)))
                        .toList(),
                    onChanged: (v) => setState(() {
                          showId = v;
                          cart.clear();
                        }))),
          ]),
          const SizedBox(height: 7),
          SizedBox(
              height: 64,
              child: DropdownButtonFormField<String>(
                  key: ValueKey('$boardId-$schemeId'),
                  initialValue: schemeId,
                  isExpanded: true,
                  decoration: const InputDecoration(
                      contentPadding:
                          EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      border: OutlineInputBorder()),
                  items: available
                      .map((x) => DropdownMenuItem(
                          value: x['id'] as String,
                          child:
                              Text(x['name'], overflow: TextOverflow.visible)))
                      .toList(),
                  onChanged: (v) {
                    setState(() {
                      schemeId = v;
                      box = false;
                      number.clear();
                    });
                    focusNumberAndKeyboard();
                  })),
          const SizedBox(height: 8),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
                flex: 3,
                child: TextField(
                    controller: number,
                    focusNode: numberFocus,
                    autofocus: true,
                    maxLength: length,
                    keyboardType: TextInputType.number,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(length)
                    ],
                    decoration: InputDecoration(
                        labelText: '$length Digit Number',
                        counterText: '',
                        border: const OutlineInputBorder()))),
            const SizedBox(width: 6),
            SizedBox(
                width: 72,
                height: 56,
                child: FilterChip(
                    label: const Text('BOX'),
                    labelPadding: EdgeInsets.zero,
                    selected: box,
                    onSelected:
                        length < 2 ? null : (v) => setState(() => box = v))),
            const SizedBox(width: 6),
            Expanded(
                child: TextField(
                    controller: qty,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: const InputDecoration(
                        labelText: 'Qty', border: OutlineInputBorder())))
          ]),
          const SizedBox(height: 8),
          Wrap(
              spacing: 7,
              runSpacing: 7,
              children: [1, 2, 3, 4, 5, 10]
                  .map((q) => SizedBox(
                      width: 54,
                      height: 44,
                      child: OutlinedButton(
                          style: OutlinedButton.styleFrom(
                              padding: EdgeInsets.zero,
                              minimumSize: const Size(54, 44)),
                          onPressed: () => add(q),
                          child: Text('$q'))))
                  .toList()),
          const SizedBox(height: 10),
          FilledButton(onPressed: add, child: const Text('Add to Bill')),
          if (note.isNotEmpty)
            Padding(padding: const EdgeInsets.all(8), child: Text(note)),
          const Divider(),
          ...cart.reversed.toList().asMap().entries.map((e) => Container(
              height: 38,
              padding: const EdgeInsets.only(left: 8),
              decoration: const BoxDecoration(
                  border: Border(bottom: BorderSide(color: Color(0xff4d3068)))),
              child: Row(children: [
                Expanded(
                    child: Text(
                        '${e.value['boardCode']} ${e.value['catalogSchemeName']} ${e.value['number']} X ${e.value['quantity']}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis)),
                SizedBox(
                    width: 38,
                    height: 38,
                    child: IconButton(
                        padding: EdgeInsets.zero,
                        iconSize: 19,
                        icon: const Icon(Icons.close, color: Colors.redAccent),
                        onPressed: () => setState(
                            () => cart.removeAt(cart.length - 1 - e.key))))
              ]))),
          if (cart.isNotEmpty)
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Text('${cart.length} entries'),
              Text('₹${total.toStringAsFixed(0)}',
                  style: Theme.of(c).textTheme.headlineSmall)
            ])
        ])),
        bottomNavigationBar: SafeArea(
            child: Container(
                padding: const EdgeInsets.fromLTRB(8, 7, 8, 8),
                decoration: const BoxDecoration(
                    color: Color(0xff211133),
                    border: Border(top: BorderSide(color: Color(0xff51326d)))),
                child: Row(children: [
                  Expanded(
                      child: TextButton(
                          onPressed: showResults,
                          style: TextButton.styleFrom(
                              padding: const EdgeInsets.symmetric(horizontal: 1)),
                          child: const Text('RESULTS',
                              style: TextStyle(fontSize: 9)))),
                  Expanded(
                      child: TextButton(
                          onPressed: showReports,
                          style: TextButton.styleFrom(
                              padding: const EdgeInsets.symmetric(horizontal: 2)),
                          child: const Text('REPORTS',
                              style: TextStyle(fontSize: 10)))),
                  Expanded(
                      child: TextButton(
                      onPressed: showPreviousBills,
                          style: TextButton.styleFrom(
                              padding: const EdgeInsets.symmetric(horizontal: 2)),
                          child: const Text('PREVIOUS',
                              style: TextStyle(fontSize: 10)))),
                  Expanded(
                      child: FilledButton(
                          style: FilledButton.styleFrom(
                              padding: const EdgeInsets.symmetric(horizontal: 4)),
                          onPressed:
                              saving || cart.isEmpty ? null : () => settle(),
                          child: const Text('OK',
                              style: TextStyle(fontSize: 11)))),
                  const SizedBox(width: 4),
                  Expanded(
                      flex: 2,
                      child: FilledButton.icon(
                          style: FilledButton.styleFrom(
                              padding: const EdgeInsets.symmetric(horizontal: 5)),
                          onPressed: saving || cart.isEmpty
                              ? null
                              : () => settle(print: true),
                          icon: const Icon(Icons.print, size: 16),
                          label: const Text('OK & PRINT',
                              style: TextStyle(fontSize: 10))))
                ]))));
  }
}

class Info extends StatelessWidget {
  const Info(this.label, this.value, {super.key});
  final String label, value;
  @override
  Widget build(BuildContext c) => Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
          color: const Color(0xff211133),
          borderRadius: BorderRadius.circular(9)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (label.isNotEmpty)
          Text(label,
              style: const TextStyle(fontSize: 10, color: Colors.blueGrey)),
        Text(value,
            maxLines: 2,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12))
      ]));
}
