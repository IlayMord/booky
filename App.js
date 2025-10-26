import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Booky</Text>
      <Text style={styles.subtitle}>זמן תורים בקלות ובמהירות</Text>

      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>התחל עכשיו</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#4b2e05',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#7a6a55',
    marginBottom: 40,
  },
  button: {
    backgroundColor: '#ff9a00',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 25,
  },
  buttonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
});
