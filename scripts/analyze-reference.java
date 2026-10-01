// Run Logisim 2.7.1's combinational analysis on scripted cases.
// Source-file mode: java -Djava.awt.headless=true -cp logisim.jar analyze-reference.java cases.tsv
//
// Case lines (tab-separated), one JSON object printed per case:
//   min    <inputs>  <column of 0/1/x>              minimal SOP and POS
//   parse  <inputs>  <text>                         parsed expression or error range
//   circ   <file>    <circuit>                      analyzer contents for a circuit
//   build  <inputs>  <outputs>  <exprs ; separated> <twoInputs> <nands>
//   stats  <file>    <circuit>                      FileStatistics counts
import java.io.File;
import java.nio.file.*;
import java.util.*;
import com.cburch.logisim.analyze.model.*;
import com.cburch.logisim.circuit.*;
import com.cburch.logisim.comp.Component;
import com.cburch.logisim.data.*;
import com.cburch.logisim.file.*;
import com.cburch.logisim.instance.Instance;
import com.cburch.logisim.instance.StdAttr;
import com.cburch.logisim.proj.Project;
import com.cburch.logisim.std.gates.CircuitBuilder;
import com.cburch.logisim.std.wiring.Pin;

@SuppressWarnings({"unchecked", "rawtypes"})
class AnalyzeReference {
    static String q(String s) {
        if (s == null) return "null";
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 32) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }

    static List<String> names(String csv) {
        return csv.isEmpty() ? new ArrayList<String>() : Arrays.asList(csv.split(","));
    }

    static String list(List<String> items) {
        ArrayList<String> out = new ArrayList<>();
        for (String s : items) out.add(q(s));
        return "[" + String.join(",", out) + "]";
    }

    static String str(Expression e) {
        return e == null ? null : e.toString();
    }

    static String min(String[] f) {
        AnalyzerModel model = new AnalyzerModel();
        model.setVariables(names(f[1]), Arrays.asList("x"));
        Entry[] column = new Entry[f[2].length()];
        for (int i = 0; i < column.length; i++) column[i] = Entry.parse(f[2].substring(i, i + 1));
        model.getTruthTable().setOutputColumn(0, column);
        OutputExpressions exprs = model.getOutputExpressions();
        String sop = str(exprs.getMinimalExpression("x"));
        exprs.setMinimizedFormat("x", AnalyzerModel.FORMAT_PRODUCT_OF_SUMS);
        String pos = str(exprs.getMinimalExpression("x"));
        return "{\"sop\":" + q(sop) + ",\"pos\":" + q(pos) + "}";
    }

    static String parse(String[] f) {
        AnalyzerModel model = new AnalyzerModel();
        model.setVariables(names(f[1]), new ArrayList<String>());
        try {
            return "{\"expr\":" + q(str(Parser.parse(f[2], model))) + "}";
        } catch (ParserException e) {
            return "{\"error\":[" + e.getOffset() + "," + e.getEndOffset() + "]}";
        }
    }

    static String circ(String[] f) throws Exception {
        LogisimFile file = new Loader(null).openLogisimFile(new File(f[1]));
        Project proj = new Project(file);
        Circuit circuit = file.getCircuit(f[2]);
        Map<Instance, String> pinNames = Analyze.getPinLabels(circuit);
        ArrayList<String> inputs = new ArrayList<>(), outputs = new ArrayList<>();
        for (Map.Entry<Instance, String> e : pinNames.entrySet()) {
            boolean input = Pin.FACTORY.isInputPin(e.getKey());
            (input ? inputs : outputs).add(e.getValue());
            if (e.getKey().getAttributeValue(StdAttr.WIDTH).getWidth() > 1)
                return "{\"error\":" + q(input ? "multibitInput" : "multibitOutput") + "}";
        }
        if (inputs.isEmpty() || outputs.isEmpty() || inputs.size() > 12 || outputs.size() > 12)
            return "{\"inputs\":" + list(inputs) + ",\"outputs\":" + list(outputs) + "}";
        AnalyzerModel model = new AnalyzerModel();
        model.setVariables(inputs, outputs);
        String notice = null;
        StringBuilder out = new StringBuilder("{");
        try {
            Analyze.computeExpression(model, circuit, pinNames);
            ArrayList<String> exprs = new ArrayList<>();
            for (String o : outputs) exprs.add(str(model.getOutputExpressions().getExpression(o)));
            out.append("\"exprs\":").append(list(exprs)).append(",");
        } catch (AnalyzeException e) {
            notice = e.getClass().getSimpleName();
            Analyze.computeTable(model, proj, circuit, pinNames);
        }
        ArrayList<String> columns = new ArrayList<>();
        TruthTable table = model.getTruthTable();
        for (int c = 0; c < table.getOutputColumnCount(); c++) {
            StringBuilder col = new StringBuilder();
            for (int r = 0; r < table.getRowCount(); r++) col.append(table.getOutputEntry(r, c).getDescription());
            columns.add(col.toString());
        }
        out.append("\"inputs\":").append(list(inputs)).append(",\"outputs\":").append(list(outputs));
        out.append(",\"notice\":").append(q(notice)).append(",\"table\":").append(list(columns)).append("}");
        return out.toString();
    }

    static String build(String[] f) throws Exception {
        AnalyzerModel model = new AnalyzerModel();
        List<String> outputs = names(f[2]);
        model.setVariables(names(f[1]), outputs);
        String[] exprs = f[3].split(";", -1);
        for (int i = 0; i < outputs.size(); i++)
            model.getOutputExpressions().setExpression(outputs.get(i), Parser.parse(exprs[i], model));
        Circuit circuit = new Circuit("built");
        CircuitMutation xn = CircuitBuilder.build(circuit, model, f[4].equals("1"), f[5].equals("1"));
        xn.execute();
        ArrayList<String> comps = new ArrayList<>();
        for (Component c : circuit.getNonWires()) {
            ArrayList<String> attrs = new ArrayList<>();
            for (Attribute a : c.getAttributeSet().getAttributes())
                attrs.add(q(a.getName()) + ":" + q(a.toStandardString(c.getAttributeSet().getValue(a))));
            comps.add("{\"name\":" + q(c.getFactory().getName()) + ",\"loc\":" + q(c.getLocation().toString())
                + ",\"attrs\":{" + String.join(",", attrs) + "}}");
        }
        ArrayList<String> wires = new ArrayList<>();
        for (Wire w : circuit.getWires()) wires.add(w.getEnd0() + "-" + w.getEnd1());
        Collections.sort(comps);
        Collections.sort(wires);
        return "{\"components\":[" + String.join(",", comps) + "],\"wires\":" + list(wires) + "}";
    }

    static String stats(String[] f) throws Exception {
        LogisimFile file = new Loader(null).openLogisimFile(new File(f[1]));
        FileStatistics st = FileStatistics.compute(file, file.getCircuit(f[2]));
        ArrayList<String> rows = new ArrayList<>();
        for (FileStatistics.Count c : st.getCounts())
            rows.add("[" + q(c.getFactory().getName()) + "," + c.getSimpleCount() + "," + c.getUniqueCount() + "," + c.getRecursiveCount() + "]");
        FileStatistics.Count a = st.getTotalWithoutSubcircuits(), b = st.getTotalWithSubcircuits();
        return "{\"counts\":[" + String.join(",", rows) + "],\"without\":[" + a.getSimpleCount() + "," + a.getUniqueCount() + ","
            + a.getRecursiveCount() + "],\"with\":[" + b.getSimpleCount() + "," + b.getUniqueCount() + "," + b.getRecursiveCount() + "]}";
    }

    public static void main(String[] args) throws Exception {
        for (String line : Files.readAllLines(Paths.get(args[0]))) {
            String[] f = line.split("\t", -1);
            switch (f[0]) {
                case "min": System.out.println(min(f)); break;
                case "parse": System.out.println(parse(f)); break;
                case "circ": System.out.println(circ(f)); break;
                case "build": System.out.println(build(f)); break;
                case "stats": System.out.println(stats(f)); break;
                default: throw new IllegalArgumentException(f[0]);
            }
        }
        System.out.flush();
        // Project starts non-daemon simulator threads
        System.exit(0);
    }
}
