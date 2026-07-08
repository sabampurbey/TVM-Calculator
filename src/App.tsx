import React, { useState, useEffect } from 'react';
import { Calculator, AlertCircle, Info, ChevronDown, Sun, Moon } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'motion/react';

const LABELS = {
  fv: { shortName: 'FV', name: 'Future Value (FV)', desc: 'Value at the end of the periods.', unit: '$' },
  pv: { shortName: 'PV', name: 'Present Value (PV)', desc: 'Initial investment or loan amount. (Use negative for cash outflow)', unit: 'Outflow (-)' },
  pmt: { shortName: 'PMT', name: 'Payment (PMT)', desc: 'Amount added or paid each period.', unit: 'Optional' },
  rate: { shortName: 'Rate', name: 'Annual Rate (I/Y)', desc: 'Interest rate per period.', unit: '%' },
  nper: { shortName: 'Periods', name: 'Periods (N)', desc: 'Total number of payment periods.', unit: 'Years' },
};

const SCENARIOS = [
  {
    name: 'Custom',
    solveFor: 'fv',
    inputs: { nper: '120', rate: '7.5', pv: '-25000', pmt: '500', fv: '142884.52' }
  },
  {
    name: 'Mortgage Payment (Monthly)',
    solveFor: 'pmt',
    inputs: { nper: '360', rate: '0.416', pv: '300000', pmt: '0', fv: '0' }
  },
  {
    name: 'Retirement Savings (Monthly)',
    solveFor: 'fv',
    inputs: { nper: '360', rate: '0.583', pv: '0', pmt: '-500', fv: '0' }
  },
  {
    name: 'Compound Interest (Annual)',
    solveFor: 'fv',
    inputs: { nper: '10', rate: '5', pv: '-10000', pmt: '0', fv: '0' }
  },
  {
    name: 'Car Loan (Monthly)',
    solveFor: 'pmt',
    inputs: { nper: '60', rate: '0.5', pv: '25000', pmt: '0', fv: '0' }
  }
];

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState('Custom');
  const [solveFor, setSolveFor] = useState<keyof typeof LABELS>('fv');
  const [inputs, setInputs] = useState({
    nper: '120',
    rate: '7.5',
    pv: '-25000',
    pmt: '500',
    fv: '142884.52'
  });
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<{
    period: number, 
    balance: number,
    beginningBalance?: number,
    interest?: number,
    payment?: number,
    principal?: number
  }[]>([]);
  const [explanation, setExplanation] = useState<string>('');

  const handleScenarioChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedScenario(val);
    const scenario = SCENARIOS.find(s => s.name === val);
    if (scenario) {
      setSolveFor(scenario.solveFor as keyof typeof LABELS);
      setInputs(scenario.inputs);
    }
  };

  useEffect(() => {
    calculate();
  }, [inputs, solveFor]);

  const calculate = () => {
    setError(null);
    setResult(null);
    setChartData([]);
    setExplanation('');

    const requiredFields = ['nper', 'rate', 'pv', 'pmt', 'fv'].filter(f => f !== solveFor);
    const vals: Record<string, number> = {};
    
    for (const field of requiredFields) {
      if (inputs[field as keyof typeof inputs] === '' || inputs[field as keyof typeof inputs] === '-') {
        setError(`Waiting for ${LABELS[field as keyof typeof LABELS].name}...`);
        return;
      }

      const val = parseFloat(inputs[field as keyof typeof inputs]);
      if (isNaN(val)) {
        setError(`Please enter a valid number for ${LABELS[field as keyof typeof LABELS].name}.`);
        return;
      }
      vals[field] = val;
    }

    try {
      let res = 0;
      const { nper: n, rate, pv, pmt, fv } = vals;
      const r = rate !== undefined ? rate / 100 : 0;

      switch (solveFor) {
        case 'fv':
          if (r === 0) {
            res = -(pv + pmt * n);
          } else {
            res = -(pv * Math.pow(1 + r, n) + pmt * ((Math.pow(1 + r, n) - 1) / r));
          }
          break;
        case 'pv':
          if (r === 0) {
            res = -(fv + pmt * n);
          } else {
            res = -(fv + pmt * ((Math.pow(1 + r, n) - 1) / r)) / Math.pow(1 + r, n);
          }
          break;
        case 'pmt':
          if (n === 0) {
            throw new Error("Number of periods (N) cannot be zero when solving for Payment.");
          }
          if (r === 0) {
            res = -(pv + fv) / n;
          } else {
            const factor = (Math.pow(1 + r, n) - 1) / r;
            res = -(fv + pv * Math.pow(1 + r, n)) / factor;
          }
          break;
        case 'rate': {
          if (n === 0) throw new Error("Number of periods (N) cannot be zero when solving for Rate.");
          
          if (pmt === 0) {
            if (pv === 0) throw new Error("Present Value cannot be zero when Payment is zero.");
            if (fv / pv > 0) throw new Error("PV and FV must have opposite signs (one inflow, one outflow).");
            res = (Math.pow(-fv / pv, 1 / n) - 1) * 100;
          } else {
            let low = -0.999999;
            let high = 100.0;
            let mid = 0;
            const f = (rateVal: number) => {
              if (Math.abs(rateVal) < 1e-9) return pv + pmt * n + fv;
              return pv * Math.pow(1 + rateVal, n) + pmt * (Math.pow(1 + rateVal, n) - 1) / rateVal + fv;
            };

            const fLow = f(low);
            const fHigh = f(high);

            if (Math.sign(fLow) === Math.sign(fHigh)) {
              throw new Error("Cannot find a valid interest rate. Ensure your cash inflows (positive) and outflows (negative) are set correctly.");
            }

            let found = false;
            for (let i = 0; i < 1000; i++) {
              mid = (low + high) / 2;
              const fMid = f(mid);
              if (Math.abs(fMid) < 1e-7) {
                found = true;
                break;
              }
              if (Math.sign(fMid) === Math.sign(fLow)) {
                low = mid;
              } else {
                high = mid;
              }
            }
            if (!found && Math.abs(f(mid)) > 1e-4) {
               throw new Error("Could not converge on a valid rate.");
            }
            res = mid * 100;
          }
          break;
        }
        case 'nper': {
          if (r === 0) {
             if (pmt === 0) throw new Error("Payment cannot be zero when Interest Rate is zero.");
             res = -(pv + fv) / pmt;
          } else {
             const num = pmt - fv * r;
             const den = pmt + pv * r;
             if (den === 0) throw new Error("Division by zero. Check your PV and PMT.");
             const ratio = num / den;
             if (ratio <= 0) {
               throw new Error("Impossible to reach the target Future Value. The interest and payments do not cover the required growth.");
             }
             res = Math.log(ratio) / Math.log(1 + r);
          }
          break;
        }
      }
      
      if (isNaN(res) || !isFinite(res)) {
        throw new Error("Calculation resulted in an invalid number. Check your inputs.");
      }
      setResult(res);

      // Generate Explanation and Chart Data
      const finalN = solveFor === 'nper' ? res : n;
      const finalRate = solveFor === 'rate' ? res : rate;
      const finalPV = solveFor === 'pv' ? res : pv;
      const finalPMT = solveFor === 'pmt' ? res : pmt;
      const finalFV = solveFor === 'fv' ? res : fv;

      const formatCurr = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(val));
      const absPV = formatCurr(finalPV);
      const absPMT = formatCurr(finalPMT);
      const absFV = formatCurr(finalFV);
      const nStr = finalN.toFixed(2);
      const rateStr = finalRate.toFixed(2) + "%";

      let exp = "";
      switch (solveFor) {
        case 'fv':
          exp = `Starting with a present value of ${absPV}, and making payments of ${absPMT} for ${nStr} periods at ${rateStr} interest, the final future value is ${absFV}.`;
          break;
        case 'pv':
          exp = `To reach a future value of ${absFV} in ${nStr} periods with payments of ${absPMT} at ${rateStr} interest, the required present value is ${absPV}.`;
          break;
        case 'pmt':
          exp = `To reach a future value of ${absFV} from a present value of ${absPV} over ${nStr} periods at ${rateStr} interest, the required payment per period is ${absPMT}.`;
          break;
        case 'rate':
          exp = `To grow a present value of ${absPV} to a future value of ${absFV} over ${nStr} periods with payments of ${absPMT}, the required interest rate is ${rateStr}.`;
          break;
        case 'nper':
          exp = `It will take ${nStr} periods to reach a future value of ${absFV} from a present value of ${absPV} with payments of ${absPMT} at ${rateStr} interest.`;
          break;
      }
      setExplanation(exp);

      const data = [];
      let currentBalance = -finalPV;
      const rVal = finalRate / 100;
      const periodsCount = Math.min(Math.ceil(finalN), 1200); // limit to 1200 points to prevent performance issues
      
      data.push({ 
        period: 0, 
        balance: currentBalance,
        beginningBalance: 0,
        interest: 0,
        payment: 0,
        principal: 0
      });

      for (let i = 1; i <= periodsCount; i++) {
        const beginningBalance = currentBalance;
        const interest = beginningBalance * rVal;
        const payment = -finalPMT;
        const principal = payment + interest;
        
        currentBalance = beginningBalance + interest + payment;
        
        data.push({ 
          period: i, 
          balance: currentBalance,
          beginningBalance: beginningBalance,
          interest: interest,
          payment: payment,
          principal: principal
        });
      }
      setChartData(data);

    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatResult = (val: number, type: keyof typeof LABELS) => {
    if (type === 'rate') return `${val.toFixed(3)}%`;
    if (type === 'nper') return val.toFixed(2);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(val);
  };

  const theme = darkMode ? {
    bgBase: 'bg-[#0A0A0B]',
    bgSurface: 'bg-[#0F0F12]',
    bgInput: 'bg-[#18181B]',
    bgCard: 'bg-[#161618]',
    textMain: 'text-[#E4E4E7]',
    textMuted: 'text-zinc-500',
    textSub: 'text-zinc-400',
    textTitle: 'text-zinc-300',
    textAccent: 'text-emerald-500',
    bgAccent: 'bg-emerald-500',
    borderLight: 'border-[#27272A]',
    borderInput: 'border-[#3F3F46]',
    errorText: 'text-rose-400',
    errorTitle: 'text-rose-500',
    errorBg: 'bg-[#161618]',
    errorBorder: 'border-rose-500',
    pvText: 'text-amber-200',
    pvLabel: 'text-amber-500',
    chartGrid: '#27272A',
    chartAxis: '#52525B',
    chartLine: '#10B981',
    chartBg: 'bg-[#0F0F12]',
    tooltipBg: 'bg-[#18181B]'
  } : {
    bgBase: 'bg-slate-50',
    bgSurface: 'bg-white',
    bgInput: 'bg-slate-50',
    bgCard: 'bg-white',
    textMain: 'text-slate-900',
    textMuted: 'text-slate-400',
    textSub: 'text-slate-500',
    textTitle: 'text-slate-800',
    textAccent: 'text-indigo-600',
    bgAccent: 'bg-indigo-600',
    borderLight: 'border-slate-200',
    borderInput: 'border-slate-200',
    errorText: 'text-rose-600',
    errorTitle: 'text-rose-700',
    errorBg: 'bg-rose-50',
    errorBorder: 'border-rose-500',
    pvText: 'text-rose-600',
    pvLabel: 'text-rose-600',
    chartGrid: '#E2E8F0',
    chartAxis: '#94A3B8',
    chartLine: '#4F46E5',
    chartBg: 'bg-white',
    tooltipBg: 'bg-white'
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className={`${theme.tooltipBg} ${theme.borderInput} border p-3 rounded-md shadow-xl text-xs`}>
          <p className={`${theme.textMuted} mb-1`}>Period {label}</p>
          <p className={`${theme.textAccent} font-mono font-bold`}>
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`h-screen w-full ${theme.bgBase} ${theme.textMain} font-sans flex flex-col overflow-hidden transition-colors`}>
      {/* Header Bar */}
      <header className={`h-16 shrink-0 border-b ${theme.borderLight} flex items-center justify-between px-6 md:px-8 ${theme.bgSurface} transition-colors`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 ${theme.bgAccent} rounded-lg flex items-center justify-center`}>
            <Calculator className={`w-5 h-5 ${darkMode ? 'text-black' : 'text-white'}`} />
          </div>
          <span className={`text-lg font-bold tracking-tight ${darkMode ? 'text-[#E4E4E7]' : 'text-slate-800'} uppercase`}>TVM Architect <span className={`${theme.textAccent} text-sm ml-1`}>v4.0</span></span>
        </div>
        <div className={`hidden md:flex items-center gap-6 text-[10px] md:text-xs font-medium ${theme.textMuted} uppercase tracking-widest`}>
          <span>Mode: Standard Compounding</span>
          <span>Precision: 4 Decimals</span>
          <span className={theme.textAccent}>System Ready</span>
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className={`p-1.5 rounded-md hover:bg-opacity-80 transition-colors ${darkMode ? 'bg-zinc-800 text-zinc-300' : 'bg-slate-100 text-slate-600'}`}
            title="Toggle Dark Mode"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Controls Panel */}
        <aside className={`w-full md:w-[420px] shrink-0 ${theme.bgSurface} border-r ${theme.borderLight} p-6 md:p-8 flex flex-col gap-6 overflow-y-auto transition-colors`}>
          <div>
            <h3 className={`text-[10px] ${theme.textTitle} font-bold uppercase tracking-widest mb-2`}>How to Use This Calculator</h3>
            <p className={`text-xs ${theme.textSub} leading-relaxed`}>
              The Time Value of Money (TVM) concept states that money available now is worth more than the same amount in the future. Select the variable you want to solve for, then enter the other 4 known variables below.
            </p>
          </div>

          <div>
            <label className={`block text-[10px] ${theme.textMuted} uppercase tracking-widest mb-3`}>Quick Scenarios</label>
            <div className="relative">
              <select
                value={selectedScenario}
                onChange={handleScenarioChange}
                className={`w-full ${theme.bgInput} border ${theme.borderInput} rounded-md px-4 py-3 text-sm appearance-none focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 ${theme.textMain} transition-colors`}
              >
                {SCENARIOS.map((s) => (
                  <option key={s.name} value={s.name}>{s.name}</option>
                ))}
              </select>
              <div className={`absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none ${theme.textSub}`}>
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div>
            <label className={`block text-[10px] ${theme.textMuted} uppercase tracking-widest mb-3`}>Solution Target</label>
            <div className="relative">
              <select
                value={solveFor}
                onChange={(e) => {
                  setSolveFor(e.target.value as keyof typeof LABELS);
                  setSelectedScenario('Custom');
                }}
                className={`w-full ${theme.bgInput} border ${theme.borderInput} rounded-md px-4 py-3 text-sm appearance-none focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 ${theme.textMain} transition-colors`}
              >
                {Object.entries(LABELS).map(([key, info]) => (
                  <option key={key} value={key}>{info.name}</option>
                ))}
              </select>
              <div className={`absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none ${theme.textSub}`}>
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5">
            {Object.entries(LABELS).map(([key, info]) => {
              if (solveFor === key) return null;
              
              const isPV = key === 'pv';
              const isRateOrPeriods = key === 'rate' || key === 'nper';
              
              return (
                <div key={key}>
                  <label className={`flex justify-between text-[10px] ${theme.textMuted} uppercase tracking-widest mb-2`}>
                    <span>{info.name}</span>
                    <span className={isPV ? `${theme.pvLabel} font-bold uppercase` : (isRateOrPeriods ? `${theme.textAccent} font-bold` : theme.textSub)}>
                      {info.unit}
                    </span>
                  </label>
                  <input
                    type={isPV ? "text" : "number"}
                    step="any"
                    value={inputs[key as keyof typeof inputs]}
                    onChange={(e) => {
                      setInputs({...inputs, [key]: e.target.value});
                      setSelectedScenario('Custom');
                    }}
                    className={`w-full ${theme.bgInput} border ${theme.borderInput} rounded-md px-4 py-3 text-lg font-mono focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 ${isPV ? theme.pvText : theme.textMain} transition-colors`}
                  />
                </div>
              );
            })}
          </div>

          <div className={`mt-2 border-t ${theme.borderLight} pt-6`}>
            <h3 className={`text-[10px] ${theme.textTitle} font-bold uppercase tracking-widest mb-4`}>Formulas Used</h3>
            <div className={`flex flex-col gap-4 font-mono text-[10px] ${theme.textSub}`}>
              <div className="flex flex-col gap-1">
                <span className={`font-sans font-bold text-[9px] uppercase tracking-wider ${theme.textMuted}`}>Future Value (FV)</span>
                <span>PV * (1 + r)^n + PMT * ((1 + r)^n - 1) / r</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className={`font-sans font-bold text-[9px] uppercase tracking-wider ${theme.textMuted}`}>Present Value (PV)</span>
                <span>-(FV + PMT * ((1 + r)^n - 1) / r) / (1 + r)^n</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className={`font-sans font-bold text-[9px] uppercase tracking-wider ${theme.textMuted}`}>Payment (PMT)</span>
                <span>-(FV + PV * (1 + r)^n) / (((1 + r)^n - 1) / r)</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className={`font-sans font-bold text-[9px] uppercase tracking-wider ${theme.textMuted}`}>Periods (N)</span>
                <span>log((PMT - FV * r) / (PMT + PV * r)) / log(1 + r)</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className={`font-sans font-bold text-[9px] uppercase tracking-wider ${theme.textMuted}`}>Rate (I/Y)</span>
                <span className="font-sans italic opacity-80">Iterative approximation (Newton-Raphson)</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Result Area */}
        <section className={`flex-1 ${theme.bgBase} p-6 md:p-12 flex flex-col overflow-y-auto transition-colors`}>
          <div className="flex-1 flex flex-col justify-center max-w-5xl mx-auto w-full">
            <span className={`text-[10px] ${theme.textAccent} font-bold uppercase tracking-[0.4em] mb-4`}>Calculated {LABELS[solveFor].shortName}</span>
            {error ? (
               <div className={`${theme.errorBg} border-l-2 ${theme.errorBorder} rounded-r-md p-6 flex gap-4 items-start mb-12`}>
                 <AlertCircle className={`w-6 h-6 ${theme.errorText} shrink-0 mt-0.5`} />
                 <div>
                   <h4 className={`${theme.errorTitle} font-bold uppercase tracking-widest text-[10px] mb-2`}>Calculation Error</h4>
                   <p className={`text-sm ${theme.errorText} font-mono`}>{error}</p>
                 </div>
               </div>
            ) : (
              <div className="flex flex-col gap-4 mb-12 min-h-[120px]">
                <motion.div
                  key={result}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                >
                  <div className="flex items-baseline gap-4">
                    <h2 className={`text-6xl md:text-8xl font-light tracking-tighter ${theme.textMain} break-all`}>
                      {result !== null ? formatResult(result, solveFor) : '—'}
                    </h2>
                  </div>
                  {result !== null && (
                    <p className={`${theme.textSub} text-lg leading-relaxed max-w-3xl mt-4`}>
                      {explanation}
                    </p>
                  )}
                </motion.div>
                
                {result !== null && chartData.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    className={`h-64 mt-8 ${theme.chartBg} border ${theme.borderLight} rounded-xl p-4 shadow-sm`}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} vertical={false} />
                        <XAxis 
                          dataKey="period" 
                          stroke={theme.chartAxis} 
                          fontSize={10} 
                          tickLine={false}
                          axisLine={false}
                          minTickGap={20}
                        />
                        <YAxis 
                          stroke={theme.chartAxis} 
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => `$${(value / 1000 >= 1 || value / 1000 <= -1) ? (value/1000).toFixed(0) + 'k' : value}`}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Line 
                          type="monotone" 
                          dataKey="balance" 
                          stroke={theme.chartLine} 
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, fill: theme.chartLine, stroke: darkMode ? '#0F0F12' : '#ffffff', strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </motion.div>
                )}

                {result !== null && chartData.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4, duration: 0.5 }}
                    className={`mt-8 ${theme.bgSurface} border ${theme.borderLight} rounded-xl shadow-sm overflow-hidden`}
                  >
                    <div className={`px-6 py-4 border-b ${theme.borderLight} flex items-center justify-between`}>
                      <h3 className={`text-xs font-bold uppercase tracking-widest ${theme.textTitle}`}>Amortization Schedule</h3>
                      <span className={`text-[10px] ${theme.textMuted} uppercase tracking-wider`}>{chartData.length - 1} Periods</span>
                    </div>
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                        <thead className={`sticky top-0 ${theme.bgInput} z-10 shadow-sm`}>
                          <tr className={`${theme.textMuted} uppercase tracking-wider`}>
                            <th className="px-6 py-4 font-medium">Period</th>
                            <th className="px-6 py-4 font-medium text-right">Begin Balance</th>
                            <th className="px-6 py-4 font-medium text-right">Payment</th>
                            <th className="px-6 py-4 font-medium text-right">Interest</th>
                            <th className="px-6 py-4 font-medium text-right">Principal</th>
                            <th className="px-6 py-4 font-medium text-right">End Balance</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${theme.borderLight} ${theme.textSub} font-mono`}>
                          {chartData.map((row) => (
                            <tr key={row.period} className={`hover:bg-opacity-50 transition-colors ${darkMode ? 'hover:bg-zinc-800' : 'hover:bg-slate-50'}`}>
                              <td className="px-6 py-3">{row.period}</td>
                              <td className="px-6 py-3 text-right">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(row.beginningBalance || 0)}</td>
                              <td className="px-6 py-3 text-right">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(row.payment || 0)}</td>
                              <td className="px-6 py-3 text-right">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(row.interest || 0)}</td>
                              <td className="px-6 py-3 text-right">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(row.principal || 0)}</td>
                              <td className={`px-6 py-3 text-right font-medium ${theme.textMain}`}>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(row.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {/* Logic & Rules Footer */}
            <div className="mt-auto pt-12">
              <div className={`p-6 ${theme.bgSurface} rounded-xl border ${theme.borderLight} shadow-sm flex flex-col md:flex-row gap-6 md:gap-8 items-start transition-colors`}>
                <div className={`flex-shrink-0 w-10 h-10 rounded-full ${theme.bgInput} flex items-center justify-center ${theme.textAccent} hidden md:flex`}>
                  <Info className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className={`text-[10px] font-bold uppercase tracking-widest ${theme.textTitle} mb-4`}>Operational Rules</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3">
                    <div className={`flex items-center gap-3 text-xs ${theme.textSub}`}>
                      <div className={`w-1.5 h-1.5 ${theme.bgAccent} rounded-full shrink-0`}></div>
                      <span>Opposite Sign Rule: Inflows and Outflows must differ.</span>
                    </div>
                    <div className={`flex items-center gap-3 text-xs ${theme.textSub}`}>
                      <div className={`w-1.5 h-1.5 ${theme.bgAccent} rounded-full shrink-0`}></div>
                      <span>I/Y Input is treated as an Annual Nominal Rate.</span>
                    </div>
                    <div className={`flex items-center gap-3 text-xs ${theme.textSub}`}>
                      <div className={`w-1.5 h-1.5 ${theme.bgAccent} rounded-full shrink-0`}></div>
                      <span>N is calculated as total compounding periods.</span>
                    </div>
                    <div className={`flex items-center gap-3 text-xs ${theme.errorText}`}>
                      <div className={`w-1.5 h-1.5 ${theme.errorBg !== 'bg-[#161618]' ? 'bg-rose-500' : 'bg-rose-500'} rounded-full shrink-0`}></div>
                      <span>Error: PV and FV cannot both be positive.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Status Bar */}
      <footer className={`h-10 shrink-0 ${theme.bgSurface} border-t ${theme.borderLight} px-6 md:px-8 flex items-center justify-between text-[10px] ${theme.textMuted} uppercase tracking-widest hidden sm:flex transition-colors`}>
        <div className="flex gap-4">
          <span>Asset ID: TVM-992-X</span>
          <span>Node: Financial-01</span>
        </div>
        <div className="flex gap-4">
          <span>Session: 01:42:09</span>
          <span className={`${theme.textAccent} font-bold`}>Secure Calculation Layer Active</span>
        </div>
      </footer>
    </div>
  );
}
