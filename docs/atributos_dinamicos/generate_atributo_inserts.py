import json
import zipfile

# Load JSON data from 'atributos.json'
with open('atributos.json', 'r', encoding='utf-8') as f:
    atributos_data = json.load(f)

# Helper function to escape single quotes in strings for SQL
def escape_single_quotes(value):
    if isinstance(value, str):
        return value.replace("'", "''")
    return value

# Helper function to format boolean fields for MySQL
def format_boolean(value):
    return "1" if value else "0"

# Helper function to format date fields for MySQL
def format_date(value):
    return f"'{value}'" if value else "NULL"

# Helper function to format 'objetivos' as a comma-separated string of descriptions
def format_objetivos(objetivos):
    if isinstance(objetivos, list):
        return ', '.join([escape_single_quotes(item.get('descricao', '')) for item in objetivos])
    return "NULL"

# Function to generate INSERT statements for 'atributo' table, including 'subatributos'
def generate_atributo_inserts(atributo, parent_codigo=None):
    inserts = []
    
    # Insert the main attribute
    codigo = escape_single_quotes(atributo.get('codigo', None))
    values = [
        f"'{codigo}'" if codigo else "NULL",
        f"'{escape_single_quotes(atributo.get('nome', None))}'" if atributo.get('nome') else "NULL",
        f"'{escape_single_quotes(atributo.get('nomeApresentacao', None))}'" if atributo.get('nomeApresentacao') else "NULL",
        f"'{escape_single_quotes(atributo.get('formaPreenchimento', None))}'" if atributo.get('formaPreenchimento') else "NULL",
        format_date(atributo.get('dataInicioVigencia', None)),
        format_date(atributo.get('dataFimVigencia', None)),
        f"'{format_objetivos(atributo.get('objetivos', []))}'",
        format_boolean(atributo.get('atributoCondicionante', None)),
        format_boolean(atributo.get('multivalorado', None)),
        f"'{escape_single_quotes(atributo.get('orientacaoPreenchimento', None))}'" if atributo.get('orientacaoPreenchimento') else "NULL",
        str(atributo.get('tamanhoMaximo', "NULL")) if atributo.get('tamanhoMaximo') else "NULL",
        f"'{escape_single_quotes(atributo.get('definicao', None))}'" if atributo.get('definicao') else "NULL",
        str(atributo.get('casasDecimais', "NULL")) if atributo.get('casasDecimais') else "NULL",
        f"'{escape_single_quotes(atributo.get('brid', None))}'" if atributo.get('brid') else "NULL",
        f"'{escape_single_quotes(atributo.get('mascara', None))}'" if atributo.get('mascara') else "NULL",
        f"'{parent_codigo}'" if parent_codigo else "NULL"  # Add parent_codigo for subatributos
    ]
    insert_statement = f"INSERT INTO atributo (codigo, nome, nome_apresentacao, forma_preenchimento, data_inicio_vigencia, data_fim_vigencia, objetivos, atributo_condicionante, multivalorado, orientacao_preenchimento, tamanho_maximo, definicao, casas_decimais, brid, mascara, parent_codigo) VALUES ({', '.join(values)});"
    inserts.append(insert_statement)

    # Handle 'subatributos' recursively
    if 'listaSubatributos' in atributo:
        for subatributo in atributo['listaSubatributos']:
            inserts.extend(generate_atributo_inserts(subatributo, parent_codigo=codigo))
    
    return inserts

# Function to generate INSERT statements for 'atributo_condicionado' table (with recursion for nested 'condicionados')
def generate_atributo_condicionado_inserts(atributo, parent_codigo=None):
    inserts = []
    atributo_codigo = escape_single_quotes(atributo.get("codigo", None)) if parent_codigo is None else parent_codigo
    
    if "condicionados" in atributo:
        for condicionado in atributo["condicionados"]:
            inner_atributo = condicionado.get("atributo", {})
            values = [
                f"'{atributo_codigo}'",  # Reference to the parent 'codigo'
                f"'{escape_single_quotes(inner_atributo.get('codigo', None))}'" if inner_atributo.get('codigo') else "NULL",
                f"'{escape_single_quotes(inner_atributo.get('nome', None))}'" if inner_atributo.get('nome') else "NULL",
                f"'{escape_single_quotes(inner_atributo.get('nomeApresentacao', None))}'" if inner_atributo.get('nomeApresentacao') else "NULL",
                f"'{escape_single_quotes(inner_atributo.get('formaPreenchimento', None))}'" if inner_atributo.get('formaPreenchimento') else "NULL",
                format_boolean(inner_atributo.get('obrigatorio', None)),
                format_date(inner_atributo.get('dataInicioVigencia', None)),
                format_date(inner_atributo.get('dataFimVigencia', None)),
                f"'{format_objetivos(inner_atributo.get('objetivos', []))}'" if inner_atributo.get('objetivos') else "NULL",
                format_boolean(inner_atributo.get('atributoCondicionante', None)),
                format_boolean(inner_atributo.get('multivalorado', None)),
                str(inner_atributo.get('tamanhoMaximo', "NULL")) if inner_atributo.get('tamanhoMaximo') else "NULL",
                f"'{escape_single_quotes(inner_atributo.get('orientacaoPreenchimento', None))}'" if inner_atributo.get('orientacaoPreenchimento') else "NULL",
                str(inner_atributo.get('casasDecimais', "NULL")) if inner_atributo.get('casasDecimais') else "NULL",
                f"'{escape_single_quotes(inner_atributo.get('definicao', None))}'" if inner_atributo.get('definicao') else "NULL",
                f"'{escape_single_quotes(inner_atributo.get('mascara', None))}'" if inner_atributo.get('mascara') else "NULL",
                f"'{escape_single_quotes(condicionado.get('descricaoCondicao', None))}'" if condicionado.get('descricaoCondicao') else "NULL",
                format_boolean(condicionado.get('obrigatorio', None)),
                format_date(condicionado.get('dataInicioVigencia', None)),
                format_date(condicionado.get('dataFimVigencia', None)),
                format_boolean(condicionado.get('multivalorado', None)),
                f'"{condicionado.get('condicao', None)}"' if condicionado.get('condicao') else "NULL"
                
            ]
            insert_statement = f"INSERT INTO atributo_condicionado (atributo_codigo, codigo, nome, nome_apresentacao, forma_preenchimento, obrigatorio, data_inicio_vigencia, data_fim_vigencia, objetivos, atributo_condicionante, multivalorado, tamanho_maximo, orientacao_preenchimento, casas_decimais, definicao, mascara, descricao_condicao, obrigatorio_con, data_inicio_vigencia_con, data_fim_vigencia_con, multivalorado_con, condicao) VALUES ({', '.join(values)});"
            inserts.append(insert_statement)

            # Recursively process nested 'condicionados'
            inserts.extend(generate_atributo_condicionado_inserts(inner_atributo, parent_codigo=escape_single_quotes(inner_atributo.get('codigo'))))

    return inserts

# Function to generate INSERT statements for 'atributo_dominio' table
def generate_dominio_inserts(atributo):
    inserts = []
    codigo_atributo = escape_single_quotes(atributo.get("codigo", None))
    if "dominio" in atributo and len(atributo["dominio"]) > 0:
        for dominio in atributo["dominio"]:
            values = [
                f"'{escape_single_quotes(dominio.get('codigo', None))}'" if dominio.get('codigo') else "NULL",
                f"'{escape_single_quotes(dominio.get('descricao', None))}'" if dominio.get('descricao') else "NULL",
                f"'{codigo_atributo}'"
            ]
            insert_statement = f"INSERT INTO atributo_dominio (codigo, descricao, atributo_codigo) VALUES ({', '.join(values)});"
            inserts.append(insert_statement)
    # Recursively process nested 'condicionados'
    if "condicionados" in atributo:
        for condicionado in atributo["condicionados"]:
            inner_atributo = condicionado.get("atributo", {})
            inserts.extend(generate_dominio_inserts(inner_atributo))
    
    # Handle 'subatributos' recursively
    if 'listaSubatributos' in atributo:
        for subatributo in atributo['listaSubatributos']:
            inserts.extend(generate_dominio_inserts(subatributo))
    
    return inserts

# Function to generate INSERT statements for 'atributo_vinculo' table
def generate_vinculo_inserts(data):
    inserts = []
    for vinculo in data["listaNcm"]:
        codigo_ncm = ''.join(filter(str.isdigit, str(vinculo.get("codigoNcm"))))  # Clean 'codigoNcm'
        for atributo in vinculo["listaAtributos"]:
            values = [
                f"'{codigo_ncm}'",  # codigo_ncm field
                f"'{escape_single_quotes(atributo.get('codigo', None))}'" if atributo.get('codigo') else "NULL",
                f"'{escape_single_quotes(atributo.get('modalidade', None))}'" if atributo.get('modalidade') else "NULL",
                format_boolean(atributo.get('obrigatorio', None)),
                format_boolean(atributo.get('multivalorado', None)),
                format_date(atributo.get('dataInicioVigencia', None)),
                format_date(atributo.get('dataFimVigencia', None))
            ]
            insert_statement = f"INSERT INTO atributo_vinculo (codigo_ncm, codigo, modalidade, obrigatorio, multivalorado, data_inicio_vigencia, data_fim_vigencia) VALUES ({', '.join(values)});"
            inserts.append(insert_statement)
    return inserts

# Saving the inserts for each table into separate SQL files
with open('atributo_inserts.sql', 'w', encoding='utf-8') as f:
    for atributo in atributos_data["detalhesAtributos"]:
        inserts = generate_atributo_inserts(atributo)
        if inserts:
            f.write('\n'.join(inserts) + '\n')

with open('atributo_condicionado_inserts.sql', 'w', encoding='utf-8') as f:
    for atributo in atributos_data["detalhesAtributos"]:
        inserts = generate_atributo_condicionado_inserts(atributo)
        if inserts:
            f.write('\n'.join(inserts) + '\n')

with open('atributo_dominio_inserts.sql', 'w', encoding='utf-8') as f:
    for atributo in atributos_data["detalhesAtributos"]:
        inserts = generate_dominio_inserts(atributo)
        if inserts:
            f.write('\n'.join(inserts))

with open('atributo_vinculo_inserts.sql', 'w', encoding='utf-8') as f:
    f.write('\n'.join(generate_vinculo_inserts(atributos_data)))

# Creating a zip file containing all the individual SQL files
with zipfile.ZipFile('sql_inserts_archive.zip', 'w') as zipf:
    zipf.write('atributo_inserts.sql')
    zipf.write('atributo_condicionado_inserts.sql')
    zipf.write('atributo_dominio_inserts.sql')
    zipf.write('atributo_vinculo_inserts.sql')

print("SQL inserts have been zipped into 'sql_inserts_archive.zip'")
