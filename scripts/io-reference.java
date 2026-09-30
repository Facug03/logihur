// Run the original Logisim 2.7.1 factories with scripted InstanceState inputs.
// Source-file mode: java -Djava.awt.headless=true -cp logisim.jar io-reference.java traces.tsv
import java.lang.reflect.*;
import java.nio.file.*;
import java.util.*;
import com.cburch.logisim.data.*;
import com.cburch.logisim.instance.*;
import com.cburch.logisim.std.io.Keyboard;

@SuppressWarnings({"unchecked", "rawtypes"})
class IoReference implements InvocationHandler {
    InstanceFactory factory;
    AttributeSet attrs;
    InstanceData data;
    Value[] ports;
    String[] output;
    long tick;
    InstanceState state;
    IoReference(String className, String values, int count) throws Exception {
        factory = (InstanceFactory) Class.forName("com.cburch.logisim.std.io." + className).getConstructor().newInstance();
        attrs = factory.createAttributeSet();
        if (!values.isEmpty()) for (String pair : values.split(";")) {
            String[] pieces = pair.split("=",2);
            for (Attribute attr : attrs.getAttributes()) if (attr.getName().equals(pieces[0])) attrs.setValue(attr,attr.parse(pieces[1]));
        }
        ports = new Value[count]; output = new String[count];
        state = (InstanceState) Proxy.newProxyInstance(InstanceState.class.getClassLoader(),new Class[]{InstanceState.class},this);
    }
    public Object invoke(Object proxy, Method method, Object[] args) {
        switch(method.getName()) {
            case "getAttributeValue": return attrs.getValue((Attribute)args[0]);
            case "getAttributeSet": return attrs;
            case "getFactory": return factory;
            case "getData": return data;
            case "setData": data=(InstanceData)args[0];return null;
            case "getPort": return ports[(Integer)args[0]];
            case "setPort": output[(Integer)args[0]]=((Value)args[1]).toString();return null;
            case "getTickCount": return tick;
            case "isPortConnected": case "isCircuitRoot": return true;
            default: return null;
        }
    }
    static Object call(Object obj,String name,Class[] types,Object... args) throws Exception {
        Method m=obj.getClass().getDeclaredMethod(name,types);m.setAccessible(true);return m.invoke(obj,args);
    }
    Object attr(String name) { for(Attribute a:attrs.getAttributes()) if(a.getName().equals(name))return attrs.getValue(a);return null; }
    String snapshot() throws Exception {
        String content="null";
        String name=factory.getName();
        if(data instanceof InstanceDataSingleton) {
            Object v=((InstanceDataSingleton)data).getValue(); content=v instanceof Value?quote(v.toString()):v.toString();
        } else if(name.equals("Keyboard")) {
            ArrayList<Integer> codes=new ArrayList<>();
            for(int i=0;i<256;i++){char c=(Character)call(data,"getChar",new Class[]{int.class},i);if(c==0)break;codes.add((int)c);}content=codes.toString();
        } else if(name.equals("TTY")) {
            ArrayList<String> rows=new ArrayList<>();int row=(Integer)call(data,"getCursorRow",new Class[]{});
            for(int i=0;i<=row;i++)rows.add(quote((String)call(data,"getRowString",new Class[]{int.class},i)));content="["+String.join(",",rows)+"]";
        } else if(name.equals("DotMatrix")) {
            ArrayList<String> vals=new ArrayList<>();int rows=(Integer)attr("matrixrows"),cols=(Integer)attr("matrixcols");
            for(int r=0;r<rows;r++)for(int c=0;c<cols;c++)vals.add(quote(call(data,"get",new Class[]{int.class,int.class,long.class},r,c,tick).toString()));content="["+String.join(",",vals)+"]";
        }
        ArrayList<String> outs=new ArrayList<>();for(String v:output)outs.add(v==null?"null":quote(v));
        return "{\"out\":["+String.join(",",outs)+"],\"data\":"+content+"}";
    }
    static String quote(String s){return "\""+s.replace("\\","\\\\").replace("\"","\\\"")+"\"";}
    public static void main(String[] args) throws Exception {
        IoReference ref=null;
        for(String line:Files.readAllLines(Path.of(args[0]))) {
            String[] fields=line.split("\t",-1);
            if(fields[0].equals("case"))ref=new IoReference(fields[2],fields[3],Integer.parseInt(fields[4]));
            else {
                ref.tick=Long.parseLong(fields[1]);
                if(!fields[2].isEmpty()){String[] values=fields[2].split(",");for(int i=0;i<values.length;i++){
                    String[] v=values[i].split(":");BitWidth w=BitWidth.create(Integer.parseInt(v[0]));
                    ref.ports[i]=v[1].equals("x")?Value.createUnknown(w):v[1].equals("e")?Value.createError(w):Value.createKnown(w,Integer.parseInt(v[1]));
                }}
                if(fields[3].startsWith("type=")){String[] codes=fields[3].substring(5).split(",");char[] chars=new char[codes.length];for(int i=0;i<codes.length;i++)chars[i]=(char)Integer.parseInt(codes[i]);Keyboard.addToBuffer(ref.state,chars);}
                else if(fields[3].startsWith("button="))ref.data=new InstanceDataSingleton(fields[3].endsWith("1")?Value.TRUE:Value.FALSE);
                else if(fields[3].startsWith("joystick=")){String[] xy=fields[3].substring(9).split(",");Constructor ctor=Class.forName("com.cburch.logisim.std.io.Joystick$State").getDeclaredConstructor(int.class,int.class);ctor.setAccessible(true);ref.data=(InstanceData)ctor.newInstance(Integer.parseInt(xy[0]),Integer.parseInt(xy[1]));}
                ref.factory.propagate(ref.state);System.out.println(ref.snapshot());
            }
        }
    }
}
